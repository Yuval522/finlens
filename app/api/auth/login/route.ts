import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { identifier, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof identifier !== "string" || !identifier.trim() || typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Enter your username/email and password" }, { status: 400 });
  }

  await ensureSchema();
  const db = getDb();
  const normalized = identifier.trim().toLowerCase();

  const result = await db.execute({
    sql: "SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?",
    args: [identifier.trim(), normalized],
  });
  const row = result.rows[0];

  // Same generic error for "no such account" and "wrong password" —
  // distinguishing them would let an attacker enumerate which
  // usernames/emails are registered.
  const genericError = NextResponse.json({ error: "Incorrect username/email or password" }, { status: 401 });
  if (!row) return genericError;

  const valid = await verifyPassword(password, String(row.password_hash));
  if (!valid) return genericError;

  const userId = String(row.id);
  const token = await createSession(userId);
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: userId, username: String(row.username), email: String(row.email) },
  });
}
