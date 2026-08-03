import { destroyCurrentSession } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/noStore";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
export const dynamic = "force-dynamic";

export async function POST() {
  await destroyCurrentSession();
  return noStoreJson({ ok: true });
}
