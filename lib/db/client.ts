import { createClient, type Client } from "@libsql/client";

/**
 * Server-only database client. Never import this from a "use client"
 * component — @libsql/client depends on Node.js APIs (and, for the local
 * file: mode, a native binary) that don't exist in the browser.
 *
 * URL selection (see .env.local.example):
 * - Locally (and in any environment where TURSO_DATABASE_URL isn't set),
 *   this points at a plain SQLite file on disk (`file:./finlens-local.db`)
 *   — zero external accounts needed to develop or run this app on one
 *   machine, matching the original "just use SQLite" preference.
 * - In production on Vercel, set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN)
 *   to a hosted Turso database instead. Turso speaks the exact same
 *   SQL/driver API as local SQLite, but over the network, which is what
 *   actually persists across Vercel's serverless invocations — a plain
 *   file on disk would NOT survive between requests/deploys there, since
 *   Vercel's function filesystem is ephemeral and read-only outside /tmp.
 *   Switching between the two modes is purely this one env var — no code
 *   changes needed when moving from local dev to the deployed app.
 */

declare global {
  // eslint-disable-next-line no-var
  var __finlensDbClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __finlensDbMigrated: Promise<void> | undefined;
}

function buildClient(): Client {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./finlens-local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return authToken ? createClient({ url, authToken }) : createClient({ url });
}

/**
 * Cached on `globalThis` rather than a plain module-level `let` — Next.js
 * dev mode hot-reloads route handler modules on every save, which would
 * otherwise construct a fresh client (and, for the local file: mode, a
 * fresh native connection) on every single edit. Same pattern commonly
 * used for Prisma/DB clients in Next.js dev.
 */
export function getDb(): Client {
  if (!globalThis.__finlensDbClient) {
    globalThis.__finlensDbClient = buildClient();
  }
  return globalThis.__finlensDbClient;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  // Deliberately a single JSON blob per (user_id, data_key) rather than
  // normalized per-holding/per-symbol tables — this exactly mirrors the
  // shape each client store (portfolio/watchlist/settings) already
  // serializes to localStorage as one JSON object, so migrating from
  // "localStorage on one browser" to "a row owned by this user" is a
  // straight lift of the same JSON with no business-logic changes to
  // derive.ts/aggregate.ts/etc.
  `CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT NOT NULL,
    data_key TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, data_key)
  )`,
];

/**
 * Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) migration runner. Cached
 * as an in-flight/completed promise on globalThis so concurrent requests
 * during the same process lifetime don't all race to run it, and repeat
 * calls after the first are instant no-ops.
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__finlensDbMigrated) {
    globalThis.__finlensDbMigrated = (async () => {
      const db = getDb();
      for (const sql of SCHEMA_STATEMENTS) {
        await db.execute(sql);
      }
    })();
  }
  return globalThis.__finlensDbMigrated;
}
