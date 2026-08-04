import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Server-only symmetric encryption for secrets we store at rest — right
 * now, exclusively the user-supplied Finnhub/Polygon/Alpha Vantage API keys
 * in the `api_keys` table (see lib/db/apiKeys.ts). Never import this from a
 * "use client" component.
 *
 * Algorithm: AES-256-GCM. Chosen over a simpler mode (e.g. AES-CBC) because
 * GCM is authenticated — decrypt() cryptographically verifies the
 * ciphertext hasn't been altered (a corrupted/tampered row throws instead
 * of silently returning garbage that gets used as an API key), and it
 * needs no separate HMAC step to get that property.
 *
 * Key handling: a single server-only secret, API_KEY_ENCRYPTION_SECRET,
 * read once from the environment (never hardcoded, same convention as
 * every other credential in this codebase — see .env.local.example). It's
 * run through scrypt (a slow, salted KDF) rather than used directly as the
 * AES key — this means the env var doesn't need to be exactly 32 bytes of
 * high-entropy data itself; a long random string (e.g. `openssl rand -hex
 * 32`) is turned into a proper 256-bit key deterministically. The scrypt
 * salt is a fixed, non-secret, app-specific string: it only needs to be
 * distinct per application (so the same passphrase run through a different
 * app's scrypt call doesn't yield the same derived key), not secret itself
 * — the real secret is API_KEY_ENCRYPTION_SECRET.
 *
 * Per-call random IV: every encrypt() call generates a fresh random 12-byte
 * IV (GCM's recommended nonce size) rather than reusing one — this is what
 * makes encrypting the same plaintext twice produce different ciphertext,
 * which matters here since a user might set the exact same API key value
 * twice (e.g. re-saving unchanged) and that shouldn't leak a "this matches
 * a previous ciphertext" signal.
 *
 * Storage format: `${ivHex}:${authTagHex}:${ciphertextHex}`, one text
 * column — simplest thing that round-trips cleanly through Postgres TEXT
 * and doesn't need a second column just for the IV/tag.
 */

const SCRYPT_SALT = "finlens-api-key-encryption-v1";
const AES_KEY_LENGTH = 32; // 256 bits
const GCM_IV_LENGTH = 12; // bytes — GCM's recommended nonce size
const GCM_AUTH_TAG_LENGTH = 16; // bytes — AES-GCM's standard tag size

let cachedKey: Buffer | undefined;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET is not set — required to store or read any user API key. " +
        "Generate one with `openssl rand -hex 32` and set it in Vercel's Project Settings -> " +
        "Environment Variables (see .env.local.example)."
    );
  }
  cachedKey = scryptSync(secret, SCRYPT_SALT, AES_KEY_LENGTH);
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value (expected iv:authTag:ciphertext)");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  if (iv.length !== GCM_IV_LENGTH || authTag.length !== GCM_AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted value (unexpected iv/authTag length)");
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  // Throws if the ciphertext/tag don't match (tampered or wrong key) —
  // GCM's authentication check, exactly the property we want here rather
  // than silently returning corrupted plaintext.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Last 4 characters of a raw key, for display ("Finnhub — connected, ending in ab12") without ever sending the real key back to the browser. */
export function maskKeySuffix(rawKey: string): string {
  return rawKey.slice(-4);
}
