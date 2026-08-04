import { getDb, ensureSchema } from "./client";
import { encrypt, decrypt, maskKeySuffix } from "@/lib/security/encryption";

/**
 * Server-only accessors for the `api_keys` table (see lib/db/client.ts's
 * schema comment). Never import this from a "use client" component, and
 * never let a decrypted key value leave this module toward the browser —
 * only listApiKeyStatus's masked shape is safe to send in an API response;
 * getDecryptedApiKey's real value is for server-side provider calls only
 * (see lib/finance/providers/{finnhub,polygon,alphaVantage}.ts callers).
 */

export const API_KEY_PROVIDERS = ["finnhub", "polygon", "alphaVantage"] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];

export function isApiKeyProvider(value: string): value is ApiKeyProvider {
  return (API_KEY_PROVIDERS as readonly string[]).includes(value);
}

export interface ApiKeyStatus {
  configured: boolean;
  last4: string | null;
  updatedAt: number | null;
}

/** Masked status for every provider — safe to send straight to the client (Settings page). Never includes the real key. */
export async function listApiKeyStatus(userId: string): Promise<Record<ApiKeyProvider, ApiKeyStatus>> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT provider, key_last4, updated_at FROM api_keys WHERE user_id = ?",
    args: [userId],
  });

  const status = Object.fromEntries(
    API_KEY_PROVIDERS.map((p) => [p, { configured: false, last4: null, updatedAt: null }])
  ) as Record<ApiKeyProvider, ApiKeyStatus>;

  for (const row of result.rows) {
    const provider = String(row.provider);
    if (!isApiKeyProvider(provider)) continue; // defensive — ignore any row an older/different build might have written
    status[provider] = {
      configured: true,
      last4: String(row.key_last4),
      updatedAt: Number(row.updated_at),
    };
  }
  return status;
}

/** Encrypts and upserts a user's key for one provider. Throws (via lib/security/encryption.ts) if API_KEY_ENCRYPTION_SECRET isn't configured, rather than ever writing a plaintext fallback. */
export async function setApiKey(userId: string, provider: ApiKeyProvider, rawKey: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO api_keys (user_id, provider, encrypted_key, key_last4, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, provider)
          DO UPDATE SET encrypted_key = excluded.encrypted_key, key_last4 = excluded.key_last4, updated_at = excluded.updated_at`,
    args: [userId, provider, encrypt(rawKey), maskKeySuffix(rawKey), now, now],
  });
}

export async function deleteApiKey(userId: string, provider: ApiKeyProvider): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM api_keys WHERE user_id = ? AND provider = ?",
    args: [userId, provider],
  });
}

/**
 * Decrypted key for actually calling a provider — server-side use only
 * (see the quotes route's optional per-user fallback). Returns null if the
 * user hasn't configured this provider, same "absent, not an error" shape
 * as the rest of this app's optional-enrichment providers (fmp.ts).
 */
export async function getDecryptedApiKey(userId: string, provider: ApiKeyProvider): Promise<string | null> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
    args: [userId, provider],
  });
  const row = result.rows[0];
  if (!row) return null;
  return decrypt(String(row.encrypted_key));
}
