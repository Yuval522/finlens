import { getCurrentUser } from "@/lib/auth/session";
import { noStoreJson, dbErrorJson } from "@/lib/http/noStore";
import { API_KEY_PROVIDERS, isApiKeyProvider, listApiKeyStatus, setApiKey, deleteApiKey } from "@/lib/db/apiKeys";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
export const dynamic = "force-dynamic";

/**
 * Secure API Keys Migration: dedicated, auth-gated route for the three
 * user-supplied financial-data-provider keys (Finnhub, Polygon, Alpha
 * Vantage). Deliberately separate from /api/user-data/[key] — that route's
 * generic JSON-blob model is exactly what used to let these keys ride
 * along in plaintext inside the general "settings" blob; this route only
 * ever sends a masked status shape to the client (see listApiKeyStatus)
 * and only ever writes encrypted values (see lib/db/apiKeys.ts /
 * lib/security/encryption.ts).
 */

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson({ error: "Not signed in" }, { status: 401 });
    }
    const status = await listApiKeyStatus(user.id);
    return noStoreJson({ keys: status });
  } catch (err) {
    return dbErrorJson(err, "GET /api/settings/api-keys");
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid request body" }, { status: 400 });
  }

  const { provider, key } = (body ?? {}) as Record<string, unknown>;
  if (typeof provider !== "string" || !isApiKeyProvider(provider)) {
    return noStoreJson(
      { error: `Unknown provider — must be one of: ${API_KEY_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof key !== "string" || key.trim().length === 0) {
    return noStoreJson({ error: "Enter a key" }, { status: 400 });
  }
  // Sanity cap — every real provider key is well under this; guards
  // against accidentally pasting something else (a whole cURL command, a
  // JSON blob, etc.) into the field.
  if (key.trim().length > 256) {
    return noStoreJson({ error: "That doesn't look like a valid API key (too long)" }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson({ error: "Not signed in" }, { status: 401 });
    }
    await setApiKey(user.id, provider, key.trim());
    const status = await listApiKeyStatus(user.id);
    return noStoreJson({ keys: status });
  } catch (err) {
    return dbErrorJson(err, "PUT /api/settings/api-keys");
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  if (!isApiKeyProvider(provider)) {
    return noStoreJson(
      { error: `Unknown provider — must be one of: ${API_KEY_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson({ error: "Not signed in" }, { status: 401 });
    }
    await deleteApiKey(user.id, provider);
    const status = await listApiKeyStatus(user.id);
    return noStoreJson({ keys: status });
  } catch (err) {
    return dbErrorJson(err, "DELETE /api/settings/api-keys");
  }
}
