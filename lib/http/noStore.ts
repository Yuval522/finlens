import { NextResponse } from "next/server";

/**
 * Mobile state-sync fix: every auth/session/user-data response must never
 * be cached by the browser's own HTTP cache, an intermediate proxy, or
 * (a real-world factor on mobile specifically) some carriers' transparent
 * caching layers. Without an explicit no-store, a device that fetched
 * "/api/auth/me" or "/api/user-data/portfolio" once could keep being
 * served that same cached response after the underlying data changed
 * elsewhere (e.g. edited on desktop) — exactly the "mobile shows stale
 * portfolio/account state" symptom this fixes. Mirrors the
 * `dynamic = "force-dynamic"` convention already used by /api/quotes for
 * the same reason (see that route for the sibling rationale).
 */
export function noStoreJson<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Cache-Control": "no-store, must-revalidate" },
  });
}

/**
 * Catch-all for any thrown error inside an auth/user-data route's database
 * work (ensureSchema, db.execute, session creation, ...). Two jobs:
 *
 * 1. Always return valid, no-store JSON with a generic, safe-to-show
 *    message — never let an unhandled exception fall through to Next's own
 *    generic HTML error page, which client code here always expects to
 *    `.json()`-parse (see AuthContext's `body = await res.json().catch(()
 *    => ({}))` — that catch silently produces `{}`, so without this the
 *    user only ever sees a generic "Sign up failed" with zero diagnostic
 *    value, and nothing is logged server-side either).
 * 2. Log the REAL error server-side (visible via `vercel logs` in
 *    production) — with an extra-specific message for the single most
 *    likely cause of a fully-broken signup/login in production: no
 *    TURSO_DATABASE_URL configured, so lib/db/client.ts fell back to a
 *    local SQLite file that Vercel's serverless functions can't write to
 *    (read-only filesystem outside /tmp) — every DB write throws, and
 *    without this check that thrown error was easy to mistake for a
 *    generic bug instead of a one-line environment-variable fix.
 */
export function dbErrorJson(err: unknown, context: string) {
  const missingTurso = process.env.VERCEL === "1" && !process.env.TURSO_DATABASE_URL;
  if (missingTurso) {
    console.error(
      `[FinLens] ${context} failed — this looks like a production database misconfiguration: ` +
        "TURSO_DATABASE_URL is not set, so the server fell back to a local SQLite file, which " +
        "Vercel's serverless functions cannot write to (the filesystem is read-only outside /tmp). " +
        "Create a Turso database and set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in this project's " +
        "Vercel environment variables (see .env.local.example for the exact steps), then redeploy. " +
        "Underlying error:",
      err
    );
  } else {
    console.error(`[FinLens] ${context} failed:`, err);
  }
  return noStoreJson({ error: "Something went wrong on our end. Please try again in a moment." }, { status: 500 });
}
