/**
 * Finnhub — optional, per-user supplementary quote source.
 *
 * Unlike lib/finance/providers/fmp.ts (a single, app-wide FMP_API_KEY read
 * from the environment), this provider's key comes from the currently
 * signed-in user's own encrypted, per-account key (lib/db/apiKeys.ts) —
 * there is no global fallback key. It's called from app/api/quotes/route.ts
 * only as a fallback for symbols Yahoo Finance's batch quote call didn't
 * return, and only when that user has configured a Finnhub key.
 *
 * Endpoint: GET https://finnhub.io/api/v1/quote?symbol=X&token=KEY — one of
 * Finnhub's stable, documented free-tier endpoints (60 req/min on the free
 * plan). Response shape: { c: current price, d: change, dp: change percent,
 * h: day high, l: day low, o: day open, pc: previous close, t: unix
 * timestamp (seconds) }. Notably absent from this endpoint: company name,
 * exchange, market cap — Finnhub puts those on a separate `/stock/profile2`
 * call this function deliberately doesn't make, to keep a screener-scale
 * batch of fallback lookups to one request per missing symbol rather than
 * two.
 *
 * IMPORTANT — unverified live in this environment: outbound network access
 * to finnhub.io is blocked by this sandbox's egress proxy (same
 * restriction documented in providers/fmp.ts), so this could not be
 * exercised end-to-end here. The request/response shape follows Finnhub's
 * publicly documented stable API. Spot-check against a live key on your
 * own machine before relying on it.
 */

import type { MarketQuote } from "../types";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

interface FinnhubQuoteResponse {
  c: number; // current price
  d: number | null; // change
  dp: number | null; // change percent
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // unix seconds
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Best-effort single-symbol quote. Returns null (never throws) on any
 * failure — network error, timeout, invalid key, symbol not found, or a
 * response missing its price field — so a caller can always safely treat
 * this as "no fallback available" and fall through, same convention as
 * every optional-enrichment provider in this codebase.
 */
export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<MarketQuote | null> {
  const url = new URL(`${FINNHUB_BASE_URL}/quote`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.warn(`[Stox] Finnhub quote request failed for ${symbol}: HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as FinnhubQuoteResponse;
    const price = num(data.c);
    // Finnhub returns c: 0 (and every other field 0) for a symbol it
    // doesn't recognize rather than an HTTP error — a real quote is never
    // exactly 0, so this is the actual "not found" signal to check.
    if (price === null || price === 0) return null;

    return {
      symbol,
      name: symbol,
      exchange: "—",
      currency: "USD",
      quoteType: null,
      price,
      change: num(data.d),
      changePercent: num(data.dp),
      marketCap: null,
      marketState: null,
      asOf: typeof data.t === "number" ? data.t * 1000 : null,
      timezone: null,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      preMarketTime: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      postMarketTime: null,
      dayOpen: num(data.o),
      dayHigh: num(data.h),
      dayLow: num(data.l),
      previousClose: num(data.pc),
      weekHigh52: null, // not returned by Finnhub's /quote endpoint
      weekLow52: null,
      firstTradeDateEpochMs: null,
      source: "finnhub",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[Stox] Finnhub quote request timed out for ${symbol}`);
    } else {
      console.warn(`[Stox] Finnhub quote request threw for ${symbol}:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}
