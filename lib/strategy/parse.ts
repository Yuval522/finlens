import { getAnthropicClient, STRATEGY_PARSE_MODEL } from "@/lib/ai/anthropic";
import { STRATEGY_METRICS, STRATEGY_OPERATORS, type ParsedStrategy, type StrategyFilter, type StrategyMetric } from "./types";

/**
 * Natural-language -> structured filter spec, via Claude's tool-use
 * (forced tool_choice, not free-form text parsing) — this is what
 * guarantees the model's output is always valid JSON matching
 * ParsedStrategy's shape rather than "usually" matching it. The model
 * never sees or touches real market data here; its only job is
 * translating free text (English or Hebrew) into this closed-vocabulary
 * spec, which sanitizeParsedStrategy below re-validates regardless of
 * what the model returned — defense in depth against a malformed or
 * unexpected tool-use response.
 */

const MAX_QUERY_LENGTH = 500;
const MAX_FILTERS = 6;

const SYSTEM_PROMPT = `You translate a user's plain-language stock screening strategy into a structured filter spec. The user may write in English or Hebrew (or a mix) — understand either, and always write "explanation" back in the SAME language the user wrote in.

Supported metrics (use ONLY these — never invent a metric not in this list):
- price: current share price (USD)
- changePercent: today's price change, percent
- marketCap: market capitalization, USD
- peRatio: trailing price/earnings ratio
- dividendYieldPercent: trailing dividend yield, percent (e.g. 2.5 means 2.5%)
- volume: today's trading volume, shares
- rsi14: 14-day Relative Strength Index (0-100; conventionally, under 30 = oversold, over 70 = overbought)
- priceVsSma50: current price vs. its 50-day simple moving average, percent above (positive) or below (negative)
- priceVsSma200: current price vs. its 200-day simple moving average, percent above (positive) or below (negative)

If the user asks for something this list can't express (e.g. short interest, insider trading, options data, analyst ratings, a specific sector/industry, a specific exchange, news sentiment) — do NOT invent a filter for it. Instead set unsupported: true and explain in "explanation" (in the user's own language) what you understood but couldn't apply, or that the request doesn't match any supported metric. If the request is PARTIALLY supported (e.g. "profitable tech stocks with RSI under 30" — RSI is supported, "tech" and "profitable" aren't filterable here), apply what you can, and mention in "explanation" that the sector/profitability part couldn't be filtered.

market cap and volume are typically stated in shorthand (e.g. "10B" = 10000000000, "500M" = 500000000, "2M shares") — convert to the full number.

Values for marketCap/price/volume are always positive numbers. changePercent/priceVsSma50/priceVsSma200 can be negative (e.g. "down more than 5%" -> changePercent, lt, -5).

If the user mentions a result count ("top 10", "best 5", "give me 20 stocks") set limit accordingly; otherwise null.
If the user implies an ordering ("sorted by market cap", "highest dividend yield first", "cheapest P/E") set sortBy + sortDirection; otherwise both null. "cheapest"/"lowest"/"smallest" -> asc; "highest"/"biggest"/"largest"/"best" -> desc (for most metrics — for peRatio, "best value" conventionally means lowest, so treat unqualified "best P/E" as asc).`;

const PARSE_STRATEGY_TOOL = {
  name: "submit_parsed_strategy",
  description: "Submit the structured filter spec translated from the user's natural-language screening strategy.",
  input_schema: {
    type: "object" as const,
    properties: {
      filters: {
        type: "array",
        maxItems: MAX_FILTERS,
        items: {
          type: "object",
          properties: {
            metric: { type: "string", enum: STRATEGY_METRICS as unknown as string[] },
            operator: { type: "string", enum: STRATEGY_OPERATORS as unknown as string[] },
            value: { type: "number" },
          },
          required: ["metric", "operator", "value"],
        },
      },
      sortBy: {
        anyOf: [{ type: "string", enum: STRATEGY_METRICS as unknown as string[] }, { type: "null" }],
      },
      sortDirection: {
        anyOf: [{ type: "string", enum: ["asc", "desc"] }, { type: "null" }],
      },
      limit: { anyOf: [{ type: "integer", minimum: 1, maximum: 100 }, { type: "null" }] },
      explanation: { type: "string" },
      unsupported: { type: "boolean" },
    },
    required: ["filters", "sortBy", "sortDirection", "limit", "explanation", "unsupported"],
  },
};

export class StrategyParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "StrategyParseError";
  }
}

function isStrategyMetric(value: unknown): value is StrategyMetric {
  return typeof value === "string" && (STRATEGY_METRICS as readonly string[]).includes(value);
}

/**
 * Re-validates the model's tool-use output against ParsedStrategy's real
 * shape, independent of whatever the input_schema/enum constraints above
 * already encourage — a model can technically still return something
 * slightly off (a wrong type, an out-of-range limit, more filters than
 * MAX_FILTERS), and this is what actually enforces the contract the
 * execution engine (lib/strategy/execute.ts) can safely trust. Anything
 * that doesn't validate is dropped (filters) or coerced to a safe default
 * (sortBy/limit), never thrown — a partially-usable strategy is better
 * than failing the whole request over one bad field.
 */
function sanitizeParsedStrategy(raw: unknown): ParsedStrategy {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const rawFilters = Array.isArray(obj.filters) ? obj.filters : [];
  const filters: StrategyFilter[] = rawFilters
    .slice(0, MAX_FILTERS)
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => ({
      metric: f.metric,
      operator: f.operator,
      value: f.value,
    }))
    .filter(
      (f): f is StrategyFilter =>
        isStrategyMetric(f.metric) &&
        (STRATEGY_OPERATORS as readonly string[]).includes(f.operator as string) &&
        typeof f.value === "number" &&
        Number.isFinite(f.value)
    );

  const sortBy = isStrategyMetric(obj.sortBy) ? obj.sortBy : null;
  const sortDirection = obj.sortDirection === "asc" || obj.sortDirection === "desc" ? obj.sortDirection : null;
  const limit =
    typeof obj.limit === "number" && Number.isFinite(obj.limit)
      ? Math.max(1, Math.min(100, Math.round(obj.limit)))
      : null;
  const explanation = typeof obj.explanation === "string" ? obj.explanation.slice(0, 2000) : "";
  const unsupported = obj.unsupported === true || (filters.length === 0 && !sortBy);

  return { filters, sortBy, sortDirection, limit, explanation, unsupported };
}

export async function parseStrategy(query: string): Promise<ParsedStrategy> {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) {
    return { filters: [], sortBy: null, sortDirection: null, limit: null, explanation: "", unsupported: true };
  }

  const client = getAnthropicClient();
  let response;
  try {
    response = await client.messages.create({
      model: STRATEGY_PARSE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [PARSE_STRATEGY_TOOL],
      tool_choice: { type: "tool", name: PARSE_STRATEGY_TOOL.name },
      messages: [{ role: "user", content: trimmed }],
    });
  } catch (err) {
    throw new StrategyParseError("Failed to reach the strategy-parsing model", err);
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new StrategyParseError("Model response did not include a parsed strategy");
  }

  return sanitizeParsedStrategy(toolUse.input);
}
