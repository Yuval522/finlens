/**
 * Polygon.io — optional, per-user supplementary quote source.
 *
 * Same role/wiring as providers/finnhub.ts: called from
 * app/api/quotes/route.ts only as a fallback for symbols Yahoo's batch
 * quote call didn't return, only when the signed-in user has configured a
 * Polygon key, using that user's own key rather than a global env var.
 *
 * Endpoint: GET
 * https://api.polygon.io/v2/aggs/ticker/{symbol}/prev?apiKey=KEY —
 * deliberately the "previous day close" aggregate endpoint, not a
 * real-time snapshot/last-trade endpoint. Polygon's free "Stocks Basic"
 * plan is priced for reference/EOD data at a low request rate (a few
 * calls/min); live intraday trades and quotes are gated behind paid plans.
 * Using the previous-close endpoint means a fallback quote from this
 * provider is end-of-day, not live — reflected below by leaving
 * `marketState` null and setting `price` from the prior session's close
 * rather than claiming a live price this free tier doesn't actually offer.
 *
 * IMPORTANT — unverified live in this environment: outbound network access
 * to api.polygon.io is blocked by this sandbox's egress proxy (same
 * restriction documented in providers/fmp.ts), so this could not be
 * exercised end-to-end here. The request/response shape follows Polygon's
 * publicly documented v2 aggregates API. Spot-check against a live key on
 * your own machine before relying on it.
 */

import type { MarketQuote } from "../types";

const POLYGON_BASE_URL = "https://api.polygon.io";

interface PolygonPrevCloseResult {
  T?: string; // ticker
  o?: number; // open
  h?: number; // high
  l?: number; // low
  c?: number; // close
  v?: number; // volume
  t?: number; // unix ms
}

interface PolygonPrevCloseResponse {
  status?: string;
  resultsCount?: number;
  results?: PolygonPrevCloseResult[];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Best-effort single-symbol previous-close quote. Returns null (never
 * throws) on any failure, same convention as fetchFinnhubQuote — a caller
 * always safely falls through to "no fallback available".
 */
export async function fetchPolygonQuote(symbol: string, apiKey: string): Promise<MarketQuote | null> {
  const url = new URL(`${POLYGON_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("apiKey", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.warn(`[FinLens] Polygon quote request failed for ${symbol}: HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as PolygonPrevCloseResponse;
    const result = data.results?.[0];
    const price = num(result?.c);
    if (!result || price === null) return null;

    const open = num(result.o);
    const change = open !== null ? price - open : null;
    const changePercent = open !== null && open !== 0 ? (price - open) / open : null;

    return {
      symbol,
      name: symbol,
      exchange: "—",
      currency: "USD",
      quoteType: null,
      price,
      change,
      changePercent,
      marketCap: null,
      // This is a previous-day-close figure, not a live quote — leaving
      // marketState null (rather than e.g. "CLOSED") avoids implying this
      // reflects the CURRENT session's state.
      marketState: null,
      asOf: num(result.t),
      timezone: null,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      preMarketTime: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      postMarketTime: null,
      dayOpen: open,
      dayHigh: num(result.h),
      dayLow: num(result.l),
      previousClose: null, // this endpoint's `c` IS the previous close — no separate value to report here
      source: "polygon",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[FinLens] Polygon quote request timed out for ${symbol}`);
    } else {
      console.warn(`[FinLens] Polygon quote request threw for ${symbol}:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}
