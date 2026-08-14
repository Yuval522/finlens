import { noStoreJson } from "@/lib/http/noStore";
import { refreshStrategyUniverseMetrics } from "@/lib/strategy/universe-refresh";

/**
 * Background refresh for the Strategy Builder's precomputed universe
 * metrics (see lib/db/client.ts's strategy_universe_metrics schema comment
 * and lib/strategy/universe-refresh.ts's module doc comment for the full
 * design). Triggered by Vercel Cron per vercel.json's schedule — GET is
 * the method Vercel Cron invokes with, and is also what's used here for
 * manual/local testing with a plain curl.
 *
 * maxDuration=60 is the Hobby-plan ceiling for an explicitly configured
 * maxDuration (Pro/Enterprise can go higher). refreshStrategyUniverseMetrics's
 * own default 45s time budget leaves ~15s of headroom under this for the
 * in-flight batch to finish and this route to respond cleanly, rather than
 * the platform hard-killing the function mid-write.
 *
 * vercel.json's schedule ("30 21 * * 1-5") is once daily, weekdays, at
 * 21:30 UTC — shortly after the US market closes (~4:30-5:30pm US Eastern
 * depending on DST; cron is always UTC and doesn't shift for DST itself).
 * Deliberately once/day: Vercel's Hobby plan rejects at DEPLOY time any
 * cron expression that would fire more than once a day, so this is the
 * safe default for that tier. On Pro or higher, this can be safely
 * increased — e.g. "*\/30 13-21 * * 1-5" for every 30 minutes during/around
 * US market hours — for fresher intraday RSI/SMA data;
 * universe-refresh.ts's priority-by-staleness + progressive-upsert design
 * is correct at any cadence, more frequent or less, with no code changes
 * needed beyond vercel.json's schedule string.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on
  // its own cron-triggered requests once CRON_SECRET is set as an env var
  // on this project — see .env.local.example. This is the same header a
  // manual/local test request needs to include.
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const secretConfigured = Boolean(process.env.CRON_SECRET);
  if (!secretConfigured) {
    console.error(
      "[FinLens] GET /api/cron/refresh-strategy-universe — CRON_SECRET is not set; refusing to run an unauthenticated " +
        "data-refresh endpoint. Set CRON_SECRET (see .env.local.example) to enable this route."
    );
    return noStoreJson({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    console.warn("[FinLens] GET /api/cron/refresh-strategy-universe — rejected: missing or invalid Authorization header.");
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshStrategyUniverseMetrics();
    console.log(`[FinLens] GET /api/cron/refresh-strategy-universe — completed: ${JSON.stringify(result)}`);
    return noStoreJson(result);
  } catch (err) {
    console.error("[FinLens] GET /api/cron/refresh-strategy-universe — failed:", err);
    return noStoreJson({ error: "Universe refresh failed. See server logs for details." }, { status: 500 });
  }
}
