import { randomUUID } from "crypto";
import { getDb, ensureSchema } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/noStore";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid request body" }, { status: 400 });
  }

  const { username, email, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return noStoreJson(
      { error: "Username must be 3-24 characters, letters/numbers/underscores only" },
      { status: 400 }
    );
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return noStoreJson({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return noStoreJson({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  await ensureSchema();
  const db = getDb();
  const normalizedEmail = email.toLowerCase();

  // Explicit pre-checks (rather than only relying on the UNIQUE constraint
  // and parsing the resulting SQLite error string) so the user gets a
  // specific, friendly "username taken" vs "email already registered"
  // message instead of a generic failure.
  const existing = await db.execute({
    sql: "SELECT username, email FROM users WHERE username = ? OR email = ?",
    args: [username, normalizedEmail],
  });
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (String(row.username) === username) {
      return noStoreJson({ error: "That username is already taken" }, { status: 409 });
    }
    return noStoreJson({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const now = Date.now();

  await db.execute({
    sql: "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, username, normalizedEmail, passwordHash, now],
  });

  const token = await createSession(id);
  await setSessionCookie(token);

  return noStoreJson({ user: { id, username, email: normalizedEmail } }, { status: 201 });
}
