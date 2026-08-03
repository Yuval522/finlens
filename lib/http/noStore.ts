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
