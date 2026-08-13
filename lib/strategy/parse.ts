import { getAnthropicClient, STRATEGY_PARSE_MODEL } from "@/lib/ai/anthropic";
import {
  STRATEGY_METRICS,
  STRATEGY_OPERATORS,
  MAX_FILTERS,
  type ParsedStrategy,
  type StrategyFilter,
  type StrategyMetric,
} from "./types";
import { parseStrategyMock } from "./mock-parse";

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

  return { filters, sortBy, sortDirection, limit, explanation, unsupported, mock: false };
}

export async function parseStrategy(query: string): Promise<ParsedStrategy> {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) {
    return { filters: [], sortBy: null, sortDirection: null, limit: null, explanation: "", unsupported: true, mock: false };
  }

  // Offline/demo fallback: ANTHROPIC_API_KEY isn't configured in this
  // environment at all (a deploy/dev-environment gap, not a per-request
  // failure) -- rather than fail every request with a "not configured
  // yet" error, fall back to a local, keyword-based parser (mock-parse.ts)
  // so the rest of the Strategy Builder (execution engine, results table,
  // transparency panel) can still be exercised end-to-end without a live
  // key. This check is deliberately on the *environment* up front, not on
  // catching the client-construction error below -- a key that's PRESENT
  // but invalid/revoked/rate-limited must still surface as a real, loud
  // StrategyParseError via the try/catch below, never silently degrade to
  // keyword-matching in a way that could mask a genuine production
  // incident once a key is actually configured.
  if (!process.env.ANTHROPIC_API_KEY) {
    return parseStrategyMock(trimmed);
  }

  // Everything that can fail before we have a validated ParsedStrategy in
  // hand — client construction (throws a plain Error synchronously if
  // ANTHROPIC_API_KEY isn't set, see lib/ai/anthropic.ts), the network
  // call itself, and the tool_choice/response-shape checks below — is
  // deliberately inside ONE try/catch so every failure mode is normalized
  // into a StrategyParseError. Previously getAnthropicClient() was called
  // *before* this try/catch: a missing/misconfigured API key threw a bare
  // Error that the route handler's `instanceof StrategyParseError` check
  // didn't recognize, so it fell through to the route's generic
  // catch-all (dbErrorJson) — surfacing a misleading "Something went
  // wrong on our end" 500 instead of the friendly, already-written
  // "Strategy Builder isn't configured yet" 503 message. Confirmed via
  // Vercel's production runtime error logs as the exact failure mode
  // behind this bug report (ANTHROPIC_API_KEY unset on Vercel).
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: STRATEGY_PARSE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [PARSE_STRATEGY_TOOL],
      tool_choice: { type: "tool", name: PARSE_STRATEGY_TOOL.name },
      messages: [{ role: "user", content: trimmed }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      // Can happen if the model hits max_tokens before emitting the
      // forced tool call, or (rare) if the API changes response shape —
      // log the raw stop_reason/content so this is diagnosable from
      // server logs rather than a bare "did not include a parsed
      // strategy" with no further detail.
      throw new StrategyParseError(
        `Model response did not include a parsed strategy (stop_reason: ${response.stop_reason})`,
        response
      );
    }

    // sanitizeParsedStrategy is written defensively (every field access
    // guarded, never assumes toolUse.input has a particular shape) and
    // shouldn't throw — but it's still inside this try/catch so that if a
    // future edit to it, or a genuinely unexpected tool_use.input shape,
    // ever does throw, that surfaces as the same clean 502/503 + logged
    // cause instead of an opaque 500.
    return sanitizeParsedStrategy(toolUse.input);
  } catch (err) {
    if (err instanceof StrategyParseError) throw err;
    throw new StrategyParseError("Failed to reach or parse a response from the strategy-parsing model", err);
  }
}
