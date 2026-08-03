import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getDb, ensureSchema } from "@/lib/db/client";
import type { AuthUser } from "./types";

/**
 * Session strategy: an opaque, cryptographically random 256-bit token
 * (crypto.randomBytes, not a JWT) stored in an httpOnly cookie, with the
 * token itself as the primary key of a `sessions` DB row that points at
 * the user. Deliberately simpler than a signed/JWT session: nothing to
 * verify beyond "does this exact token exist in the table and is it
 * unexpired" (a single indexed lookup), and logging out or force-expiring
 * a session anywhere is just deleting that row — no separate revocation
 * list or secret-rotation story to build. The token is unguessable
 * (2^256 keyspace) so possession of it is equivalent to being the user,
 * same trust model any session-cookie-based auth relies on.
 */

export const SESSION_COOKIE = "finlens_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string): Promise<string> {
  await ensureSchema();
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await db.execute({
    sql: "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    args: [token, userId, now, now + SESSION_TTL_MS],
  });
  return token;
}

/** Sets the session cookie on the response for the current request — only callable from a Route Handler or Server Action. */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure cookies require HTTPS — fine in production (Vercel serves
    // over HTTPS by default) but would silently block the cookie on plain
    // http://localhost dev, so this only turns on outside development.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

async function destroySessionByToken(token: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({ sql: "DELETE FROM sessions WHERE token = ?", args: [token] });
}

/** Reads the session cookie (if any) and resolves it to the logged-in user, or null if there's no cookie, no matching row, or the session has expired. Safe to call from any Server Component, Route Handler, or Server Action. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT users.id AS id, users.username AS username, users.email AS email, sessions.expires_at AS expires_at
          FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token = ?`,
    args: [token],
  });
  const row = result.rows[0];
  if (!row) return null;

  if (Number(row.expires_at) < Date.now()) {
    // Lazily clean up an expired session row rather than running a
    // separate sweep job — the very next login/request just creates a
    // fresh one.
    await destroySessionByToken(token);
    return null;
  }

  return { id: String(row.id), username: String(row.username), email: String(row.email) };
}

/** Logs out the current request's session: deletes the DB row (so the token can never be reused even if leaked) and clears the cookie. Only callable from a Route Handler or Server Action. */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySessionByToken(token);
  store.delete(SESSION_COOKIE);
}
