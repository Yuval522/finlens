import { getPriceHistory } from "@/lib/finance/yahoo";
import { noStoreJson } from "@/lib/http/noStore";
import {
  PORTFOLIO_RANGES,
  reconstructPortfolioHistory,
  type PortfolioRange,
  type PortfolioTransaction,
} from "@/lib/portfolio/history";
import type { PortfolioCash, PortfolioHolding } from "@/lib/portfolio/store";

// Live upstream data (real historical closes fetched per request) — never
// let Next statically cache this route, same convention as every other
// market-data proxy in this app (see /api/quotes, /api/search).
export const dynamic = "force-dynamic";

/**
 * Transaction-Aware Historical Portfolio Value fix: stateless reconstruction
 * endpoint for the "Portfolio Value" chart. Deliberately NOT auth-gated and
 * NOT reading from Postgres — unlike /api/user-data/[key], which owns the
 * server-persisted copy of a *logged-in* user's portfolio, the Portfolio
 * page works fully logged-out too (lib/portfolio/store.ts's whole design is
 * "local-only unless you sign in for cross-device sync"), so gating this
 * route on a session would break the chart for the majority local-only use
 * case. Instead the client sends its own current, authoritative snapshot
 * (transactions + holdings + cash — exactly what usePortfolio() already
 * holds in memory, whether that came from localStorage or a server sync)
 * and this route does the one thing that MUST happen server-side: fetching
 * real historical closing prices per symbol (lib/finance/yahoo.ts's
 * getPriceHistory depends on the Node-only yahoo-finance2 package and can't
 * run in a "use client" component) and running the reconstruction math
 * against them. Same stateless-proxy shape as /api/quotes and /api/search.
 */

const MAX_SYMBOLS = 60;
const MAX_TRANSACTIONS = 5000;

function isCash(value: unknown): value is PortfolioCash {
  return !!value && typeof value === "object" && typeof (value as PortfolioCash).usd === "number" && typeof (value as PortfolioCash).ils === "number";
}

function isHolding(value: unknown): value is PortfolioHolding {
  if (!value || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  return typeof h.symbol === "string" && typeof h.shares === "number" && typeof h.purchasePrice === "number" && typeof h.currency === "string";
}

function isTransaction(value: unknown): value is PortfolioTransaction {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.date === "string" &&
    (t.symbol === null || typeof t.symbol === "string") &&
    typeof t.sharesDelta === "number" &&
    (t.pool === "usd" || t.pool === "ils") &&
    typeof t.cashDelta === "number"
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid request body" }, { status: 400 });
  }

  const { transactions, holdings, cash, range } = (body ?? {}) as Record<string, unknown>;

  if (!Array.isArray(holdings) || !holdings.every(isHolding)) {
    return noStoreJson({ error: "holdings must be an array of portfolio holdings" }, { status: 400 });
  }
  if (!isCash(cash)) {
    return noStoreJson({ error: "cash must be { usd, ils }" }, { status: 400 });
  }
  if (!Array.isArray(transactions) || !transactions.every(isTransaction)) {
    return noStoreJson({ error: "transactions must be an array of ledger entries" }, { status: 400 });
  }
  if (transactions.length > MAX_TRANSACTIONS) {
    return noStoreJson({ error: "Too many transactions" }, { status: 400 });
  }
  if (typeof range !== "string" || !PORTFOLIO_RANGES.includes(range as PortfolioRange)) {
    return noStoreJson({ error: `range must be one of ${PORTFOLIO_RANGES.join(", ")}` }, { status: 400 });
  }

  const distinctSymbols = new Set<string>([
    ...holdings.map((h) => h.symbol.toUpperCase()),
    ...transactions.filter((t) => t.symbol).map((t) => (t.symbol as string).toUpperCase()),
  ]);
  if (distinctSymbols.size > MAX_SYMBOLS) {
    return noStoreJson({ error: "Too many distinct symbols" }, { status: 400 });
  }

  try {
    const points = await reconstructPortfolioHistory(
      transactions as PortfolioTransaction[],
      holdings as PortfolioHolding[],
      cash as PortfolioCash,
      range as PortfolioRange,
      getPriceHistory
    );
    return noStoreJson({ points });
  } catch (err) {
    console.error("[FinLens] POST /api/portfolio/history failed:", err);
    return noStoreJson({ error: "Couldn't compute portfolio history. Please try again in a moment." }, { status: 502 });
  }
}
