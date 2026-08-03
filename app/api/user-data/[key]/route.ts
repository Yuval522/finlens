import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Generic per-user JSON blob storage backing the portfolio/watchlist/
 * settings client stores — see lib/db/client.ts's schema comment for why
 * this is one JSON blob per (user, key) rather than normalized tables.
 * Restricted to this fixed allowlist rather than accepting any string as
 * `key` so a client can't write/read an arbitrary namespace.
 */
const ALLOWED_KEYS = new Set(["portfolio", "watchlist", "settings"]);

function isAllowedKey(key: string): boolean {
  return ALLOWED_KEYS.has(key);
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isAllowedKey(key)) {
    return NextResponse.json({ error: "Unknown data key" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT data_json FROM user_data WHERE user_id = ? AND data_key = ?",
    args: [user.id, key],
  });
  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ data: null });
  }

  try {
    return NextResponse.json({ data: JSON.parse(String(row.data_json)) });
  } catch {
    // Corrupt/unparseable row — treat the same as "nothing saved yet"
    // rather than failing the request outright.
    return NextResponse.json({ data: null });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isAllowedKey(key)) {
    return NextResponse.json({ error: "Unknown data key" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO user_data (user_id, data_key, data_json, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (user_id, data_key)
          DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    args: [user.id, key, JSON.stringify(body), Date.now()],
  });

  return NextResponse.json({ ok: true });
}
