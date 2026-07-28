"use client";

import { useSyncExternalStore } from "react";
import { toDisplayUnit } from "@/lib/format/currency";

/**
 * Client-only portfolio store, persisted to localStorage — same rationale
 * and same module-level-store + useSyncExternalStore pattern as
 * lib/watchlist/store.ts (see that file's doc comment): FinLens has no
 * user accounts/backend database, so "your portfolio" means "remembered on
 * this browser." Seeded on first-ever visit with a realistic sample
 * portfolio (see SEED_DATA below) so the page shows real charts/tables
 * immediately instead of the old empty-state stub.
 */

export interface PortfolioHolding {
  symbol: string;
  name: string;
  /** Currency the holding is priced in — ISO-ish code as used across lib/finance (USD, ILA, ...). */
  currency: string;
  shares: number;
  /** Cost basis per share, display units (already agorot->shekels etc converted). */
  purchasePrice: number;
  /** Most recently known price per share, display units. Seeded with a
   * realistic mock value; overwritten once a live /api/quotes fetch
   * succeeds, and that live value is persisted so it keeps showing on
   * future visits even if a later fetch fails (offline/rate-limited). */
  currentPrice: number;
  /** Today's % move, seeded/overwritten alongside currentPrice — drives the Daily Gain/Loss card. */
  changePercent: number;
  /** Blended annual dividend yield, percent (e.g. 0.44 = 0.44%). */
  dividendYieldPercent: number;
  /** Cumulative dividends received on this position to date, display-currency units. */
  dividendsPaid: number;
}

export interface PortfolioCash {
  usd: number;
  ils: number;
}

interface PortfolioData {
  holdings: PortfolioHolding[];
  cash: PortfolioCash;
}

const STORAGE_KEY = "finlens:portfolio";

/**
 * Realistic sample portfolio so a first-time visitor sees a fully working
 * page (charts, gain/loss, allocation, a populated table) instead of an
 * empty stub. Purchase prices are deliberately below the seeded current
 * prices so the demo shows a healthy unrealized gain, matching the
 * reference terminal's own populated-state screenshot.
 */
const SEED_DATA: PortfolioData = {
  holdings: [
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      currency: "USD",
      shares: 25,
      purchasePrice: 165.32,
      currentPrice: 231.18,
      changePercent: 1.24,
      dividendYieldPercent: 0.44,
      dividendsPaid: 142.5,
    },
    {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      currency: "USD",
      shares: 60,
      purchasePrice: 48.75,
      currentPrice: 138.92,
      changePercent: 2.15,
      dividendYieldPercent: 0.03,
      dividendsPaid: 6.2,
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      currency: "USD",
      shares: 18,
      purchasePrice: 312.4,
      currentPrice: 421.65,
      changePercent: -0.38,
      dividendYieldPercent: 0.72,
      dividendsPaid: 218.7,
    },
  ],
  cash: { usd: 2450.0, ils: 3200.0 },
};

const EMPTY_DATA: PortfolioData = { holdings: [], cash: { usd: 0, ils: 0 } };

let data: PortfolioData = SEED_DATA;
let hydrated = false;
const listeners = new Set<() => void>();

function isHolding(value: unknown): value is PortfolioHolding {
  if (!value || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  return (
    typeof h.symbol === "string" &&
    typeof h.name === "string" &&
    typeof h.currency === "string" &&
    typeof h.shares === "number" &&
    typeof h.purchasePrice === "number" &&
    typeof h.currentPrice === "number" &&
    typeof h.changePercent === "number" &&
    typeof h.dividendYieldPercent === "number" &&
    typeof h.dividendsPaid === "number"
  );
}

function readFromStorage(): PortfolioData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings.filter(isHolding) : [];
    const cash =
      parsed.cash && typeof parsed.cash.usd === "number" && typeof parsed.cash.ils === "number"
        ? { usd: parsed.cash.usd, ils: parsed.cash.ils }
        : { usd: 0, ils: 0 };
    return { holdings, cash };
  } catch {
    return null;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full/unavailable — in-memory state still works for this session.
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = readFromStorage();
  if (stored) {
    data = stored;
  } else {
    // First-ever visit: seed with the sample portfolio and persist it so a
    // reload doesn't re-seed on top of anything the user has since deleted
    // (e.g. a user who removes every seeded holding should see a real empty
    // state on their next visit, not the seed data reappearing).
    data = SEED_DATA;
    persist();
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) {
      data = readFromStorage() ?? EMPTY_DATA;
      notify();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): PortfolioData {
  ensureHydrated();
  return data;
}

function getServerSnapshot(): PortfolioData {
  // Matches the very first client render before hydration reconciles against
  // localStorage — see lib/watchlist/store.ts's identical doc comment for
  // why useSyncExternalStore makes this safe rather than a hydration bug.
  return SEED_DATA;
}

export function addHolding(holding: PortfolioHolding): void {
  ensureHydrated();
  const symbol = holding.symbol.toUpperCase();
  const existing = data.holdings.find((h) => h.symbol === symbol);
  if (existing) {
    // Adding more of a symbol you already hold: merge into a single
    // position with a blended (weighted-average) cost basis, same as any
    // real brokerage would show, rather than showing two confusing rows
    // for the same ticker.
    const totalShares = existing.shares + holding.shares;
    const blendedCost =
      (existing.shares * existing.purchasePrice + holding.shares * holding.purchasePrice) / totalShares;
    data = {
      ...data,
      holdings: data.holdings.map((h) =>
        h.symbol === symbol
          ? {
              ...h,
              shares: totalShares,
              purchasePrice: Number(blendedCost.toFixed(4)),
              currentPrice: holding.currentPrice,
              changePercent: holding.changePercent,
            }
          : h
      ),
    };
  } else {
    data = { ...data, holdings: [...data.holdings, { ...holding, symbol }] };
  }
  persist();
  notify();
}

export function removeHolding(symbolRaw: string): void {
  ensureHydrated();
  const symbol = symbolRaw.toUpperCase();
  data = { ...data, holdings: data.holdings.filter((h) => h.symbol !== symbol) };
  persist();
  notify();
}

/**
 * QA feature (live report: Cash Balance was read-only — no way to update
 * the USD/ILS figures short of clearing localStorage). Mirrors
 * addHolding/removeHolding's mutate-module-state-then-persist-then-notify
 * pattern exactly, so the Cash Balance card stays in sync with any other
 * open instance of usePortfolio() the same way holdings already do.
 * Negative values are clamped to 0 — a cash balance below zero isn't a
 * real state this app models (no margin/negative-cash concept anywhere
 * else in the portfolio math, see computePortfolioTotals).
 */
export function updateCash(next: PortfolioCash): void {
  ensureHydrated();
  data = { ...data, cash: { usd: Math.max(0, next.usd), ils: Math.max(0, next.ils) } };
  persist();
  notify();
}

/**
 * Refreshes currentPrice/changePercent for every held symbol from the live
 * /api/quotes route (same endpoint the Watchlist page already uses) and
 * persists the result — so once a fetch succeeds, that live price is what
 * shows on future visits too, not just this session. Silently no-ops on
 * failure (network-blocked sandbox, rate limit, etc.) and leaves whatever
 * price — seeded or last-known-live — already on the holding.
 */
export async function refreshLivePrices(): Promise<void> {
  ensureHydrated();
  const symbols = data.holdings.map((h) => h.symbol);
  if (symbols.length === 0) return;
  try {
    const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
    if (!res.ok) return;
    const body = await res.json();
    const quotes: { symbol: string; price: number | null; changePercent: number | null; currency: string }[] =
      body.quotes ?? [];
    if (quotes.length === 0) return;
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    data = {
      ...data,
      holdings: data.holdings.map((h) => {
        const q = bySymbol.get(h.symbol);
        if (!q || q.price == null) return h;
        return {
          ...h,
          currentPrice: toDisplayUnit(q.price, q.currency),
          changePercent: q.changePercent ?? h.changePercent,
        };
      }),
    };
    persist();
    notify();
  } catch {
    // Offline / blocked — keep showing the last-known price.
  }
}

/** Live-updating portfolio state + mutators, safe to call from any client component. */
export function usePortfolio() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    holdings: snapshot.holdings,
    cash: snapshot.cash,
    addHolding,
    removeHolding,
    updateCash,
    refreshLivePrices,
  };
}
