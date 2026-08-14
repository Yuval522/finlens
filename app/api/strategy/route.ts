import { getCurrentUser } from "@/lib/auth/session";
import { noStoreJson, dbErrorJson } from "@/lib/http/noStore";
import { parseStrategy, StrategyParseError } from "@/lib/strategy/parse";
import { executeStrategy } from "@/lib/strategy/execute";
import { MarketDataError } from "@/lib/finance/types";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
export const dynamic = "force-dynamic";

/**
 * Natural Language Strategy Builder: POST { query: string } -> parses the
 * free-text strategy via Claude (lib/strategy/parse.ts), runs it against
 * the live curated screening universe (lib/strategy/execute.ts), and
 * returns both the parsed filter spec (for the UI's "generated logic"
 * transparency panel) and the matching rows in one response.
 *
 * Auth-gated like every other user-facing data route in this app, even
 * though the query itself carries no per-user state — keeps this
 * consistent with the rest of the API surface and gives us a natural
 * place to add per-user rate limiting later if the Anthropic spend needs
 * it.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid request body" }, { status: 400 });
  }

  const { query } = (body ?? {}) as Record<string, unknown>;
  if (typeof query !== "string" || query.trim().length === 0) {
    return noStoreJson({ error: "Enter a strategy to run" }, { status: 400 });
  }
  if (query.trim().length > 500) {
    return noStoreJson({ error: "That strategy is too long (500 characters max)" }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson({ error: "Not signed in" }, { status: 401 });
    }

    const parsed = await parseStrategy(query);
    if (parsed.unsupported && parsed.filters.length === 0) {
      // Nothing we can execute — return the model's explanation without
      // spending a whole universe scan on zero filters. Shaped as a full
      // StrategyRunResult (see lib/strategy/types.ts) so the client never
      // has to special-case this response.
      return noStoreJson({ parsed, results: [], universeSize: 0, relaxed: false, relaxedNote: null, dataAsOf: null });
    }

    const run = await executeStrategy(parsed);
    // Success-path visibility: every failure mode on this route already
    // logs loudly (StrategyParseError, MarketDataError, dbErrorJson below),
    // but a run that completes normally with zero matches looked
    // identical in server logs whether that was a genuinely empty result
    // or a silent upstream data failure (see execute.ts's own diagnostic
    // for the specific technical-lookup case). This makes every run's
    // funnel counts visible regardless of outcome.
    console.log(
      `[FinLens] POST /api/strategy — ${run.results.length}/${run.universeSize} matched ` +
        `(filters=${JSON.stringify(parsed.filters)}, sortBy=${parsed.sortBy}, mock=${parsed.mock})`
    );
    return noStoreJson(run);
  } catch (err) {
    if (err instanceof StrategyParseError) {
      console.error("[FinLens] POST /api/strategy — strategy parsing failed:", err, err.cause);
      const misconfigured = !process.env.ANTHROPIC_API_KEY;
      return noStoreJson(
        {
          error: misconfigured
            ? "The Strategy Builder isn't configured yet (missing ANTHROPIC_API_KEY)."
            : "Couldn't understand that strategy. Try rephrasing it.",
        },
        { status: misconfigured ? 503 : 502 }
      );
    }
    if (err instanceof MarketDataError) {
      console.error("[FinLens] POST /api/strategy — market data fetch failed:", err, err.cause);
      return noStoreJson({ error: "Couldn't fetch live market data. Please try again in a moment." }, { status: 502 });
    }
    return dbErrorJson(err, "POST /api/strategy");
  }
}
