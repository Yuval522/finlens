import { getCurrentUser } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/noStore";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return noStoreJson({ user });
}
