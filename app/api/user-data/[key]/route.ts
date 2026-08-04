import { getDb, ensureSchema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { noStoreJson, dbErrorJson } from "@/lib/http/noStore";

// Mobile state-sync fix: never let this be cached — see lib/http/noStore.ts.
// Especially important here: this is the route that carries a user's
// actual portfolio/watchlist/settings, so a cached GET is precisely what
// would show one device stale data after it changed on another.
export const dynamic = "force-dynamic";

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
    return noStoreJson({ error: "Unknown data key" }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson({ error: "Not signed in" }, { status: 401 });
    }

    await ensureSchema();
    const db = getDb();
    const result = await db.execute({
      sql: "SELECT data_json FROM user_data WHERE user_id = ? AND data_key = ?",
      args: [user.id, key],
    });
    const row = result.rows[0];
    if (!row) {
      return noStoreJson({ data: null });
    }

    try {
      return noStoreJson({ data: JSON.parse(String(row.data_json)) });
    } catch {
      // Corrupt/unparseable row — treat the same as "nothing saved yet"
      // rather than failing the request outright.
      return noStoreJson({ data: null });
    }
  } catch (err) {
    return dbErrorJson(err, `GET user-data/${key}`);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isAllowedKey(key)) {
    return noStoreJson({ error: "Unknown data key" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson({ error: "Not signed in" }, { status: 401 });
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

    return noStoreJson({ ok: true });
  } catch (err) {
    return dbErrorJson(err, `PUT user-data/${key}`);
  }
}
