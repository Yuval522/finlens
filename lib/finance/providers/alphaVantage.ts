/**
 * Alpha Vantage — optional, per-user supplementary quote source.
 *
 * Same role/wiring as providers/finnhub.ts: called from
 * app/api/quotes/route.ts only as a fallback for symbols Yahoo's batch
 * quote call didn't return, only when the signed-in user has configured an
 * Alpha Vantage key, using that user's own key rather than a global env
 * var.
 *
 * Endpoint: GET
 * https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=X&apikey=KEY
 * — Alpha Vantage's documented free-tier quote endpoint. Response shape:
 * { "Global Quote": { "01. symbol", "02. open", "03. high", "04. low",
 * "05. price", "06. volume", "07. latest trading day", "08. previous
 * close", "09. change", "10. change percent" } }. Alpha Vantage's free
 * tier is aggressively rate-limited (documented as a handful of requests
 * per minute AND a low daily cap, tightened more than once in recent
 * years) — of the three optional providers here, this is the one most
 * likely to be exhausted quickly if used for anything beyond an
 * occasional single-symbol fallback, so it's deliberately not treated as
 * a bulk data source anywhere in this app.
 *
 * IMPORTANT — unverified live in this environment: outbound network access
 * to www.alphavantage.co is blocked by this sandbox's egress proxy (same
 * restriction documented in providers/fmp.ts), so this could not be
 * exercised end-to-end here. The request/response shape follows Alpha
 * Vantage's publicly documented GLOBAL_QUOTE endpoint. Spot-check against
 * a live key on your own machine before relying on it.
 */

import type { MarketQuote } from "../types";

const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

interface AlphaVantageGlobalQuoteResponse {
  "Global Quote"?: {
    "01. symbol"?: string;
    "02. open"?: string;
    "03. high"?: string;
    "04. low"?: string;
    "05. price"?: string;
    "06. volume"?: string;
    "07. latest trading day"?: string;
    "08. previous close"?: string;
    "09. change"?: string;
    // e.g. "1.23%" — a formatted string, not a bare number.
    "10. change percent"?: string;
  };
  // Alpha Vantage returns HTTP 200 with one of these instead of a
  // non-2xx status for a bad key, unknown symbol, or (most commonly on
  // the free tier) an exhausted rate limit — so those cases are only
  // detectable by checking for these fields, not res.ok.
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}

function parseNum(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Best-effort single-symbol quote. Returns null (never throws) on any
 * failure — including a rate-limit/error payload delivered with HTTP 200,
 * see the response type's doc comment — same convention as
 * fetchFinnhubQuote.
 */
export async function fetchAlphaVantageQuote(symbol: string, apiKey: string): Promise<MarketQuote | null> {
  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.warn(`[Stox] Alpha Vantage quote request failed for ${symbol}: HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as AlphaVantageGlobalQuoteResponse;
    if (data.Note || data.Information || data["Error Message"]) {
      console.warn(
        `[Stox] Alpha Vantage quote for ${symbol} returned an error/rate-limit payload: ` +
          (data.Note || data.Information || data["Error Message"])
      );
      return null;
    }

    const quote = data["Global Quote"];
    const price = parseNum(quote?.["05. price"]);
    if (!quote || price === null) return null;

    return {
      symbol,
      name: symbol,
      exchange: "—",
      currency: "USD",
      quoteType: null,
      price,
      change: parseNum(quote["09. change"]),
      changePercent: parseNum(quote["10. change percent"]),
      marketCap: null,
      marketState: null,
      asOf: null, // GLOBAL_QUOTE gives a trading *day* ("07. latest trading day"), not an intraday timestamp
      timezone: null,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      preMarketTime: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      postMarketTime: null,
      dayOpen: parseNum(quote["02. open"]),
      dayHigh: parseNum(quote["03. high"]),
      dayLow: parseNum(quote["04. low"]),
      previousClose: parseNum(quote["08. previous close"]),
      weekHigh52: null, // not returned by Alpha Vantage's GLOBAL_QUOTE endpoint
      weekLow52: null,
      firstTradeDateEpochMs: null,
      source: "alphaVantage",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[Stox] Alpha Vantage quote request timed out for ${symbol}`);
    } else {
      console.warn(
        `[Stox] Alpha Vantage quote request threw for ${symbol}:`,
        err instanceof Error ? err.message : err
      );
    }
    return null;
  }
}
