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
 *    production, or your terminal in local dev) — with an extra-specific
 *    message for the single most likely cause of a fully-broken
 *    signup/login: no DATABASE_URL/POSTGRES_URL configured at all. Unlike
 *    the previous Turso-based setup, this app has no "falls back to a
 *    local file" branch (see lib/db/client.ts's doc comment for why), so
 *    this misconfiguration is equally possible in local dev as it is in
 *    production — the check below deliberately does NOT gate on
 *    process.env.VERCEL for that reason.
 */
export function dbErrorJson(err: unknown, context: string) {
  const missingDb = !process.env.DATABASE_URL && !process.env.POSTGRES_URL;
  if (missingDb) {
    console.error(
      `[Stox] ${context} failed — no Postgres connection string is configured: ` +
        "neither DATABASE_URL nor POSTGRES_URL is set. In Vercel, connect the Neon " +
        "integration from your project's Storage tab (Add Integration -> Neon) — it " +
        "auto-creates a database and auto-injects these env vars into Production, " +
        "Preview, and Development, no CLI or manual copy-paste needed. For local dev, " +
        "run `vercel env pull .env.development.local` (see .env.local.example for the " +
        "exact steps). Underlying error:",
      err
    );
  } else {
    console.error(`[Stox] ${context} failed:`, err);
  }
  return noStoreJson({ error: "Something went wrong on our end. Please try again in a moment." }, { status: 500 });
}
