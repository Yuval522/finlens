import { getCurrentUser } from "@/lib/auth/session";
import { noStoreJson, dbErrorJson } from "@/lib/http/noStore";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return noStoreJson({ user });
  } catch (err) {
    // AuthContext treats any non-{user: AuthUser} shape here as "logged
    // out" (fails safe), but still worth logging the real error — a
    // broken DB connection showing every visitor as logged out is exactly
    // the kind of thing that should show up in Vercel's logs, not just
    // manifest as "nobody can sign in" with no trace.
    return dbErrorJson(err, "GET /api/auth/me");
  }
}
