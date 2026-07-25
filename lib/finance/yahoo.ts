import YahooFinance from "yahoo-finance2";
import { TtlCache } from "./cache";
import { guessCurrencyFromExchange, toExchangeBadge } from "./exchange";
import { MARKET_SUMMARY_SYMBOLS, TASE_SEED_SYMBOLS, US_FALLBACK_SYMBOLS } from "./symbols";
import { MarketDataError, type MarketQuote, type MarketState, type SearchResultItem } from "./types";

// Server-only module: never import this file from a "use client" component.
// (yahoo-finance2 needs Node APIs and has no business shipping to the browser.)

const CACHE_TTL_MS = Number(process.env.MARKET_DATA_CACHE_TTL_MS ?? 20_000);

const yahooFinance = new YahooFinance();

const quoteCache = new TtlCache<MarketQuote[]>(CACHE_TTL_MS);
const searchCache = new TtlCache<SearchResultItem[]>(CACHE_TTL_MS);
const mostActiveCache = new TtlCache<MarketQuote[]>(CACHE_TTL_MS);

const KNOWN_MARKET_STATES: MarketState[] = [
  "PRE",
  "REGULAR",
  "POST",
  "POSTPOST",
  "PREPRE",
  "CLOSED",
];

function toMarketState(state: unknown): MarketState | null {
  return typeof state === "string" && (KNOWN_MARKET_STATES as string[]).includes(state)
    ? (state as MarketState)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Adapts a raw yahoo-finance2 quote (any of its discriminated variants) into MarketQuote. */
function toMarketQuote(q: Record<string, unknown>): MarketQuote {
  const regularMarketTime = q.regularMarketTime;
  const asOf =
    regularMarketTime instanceof Date
      ? regularMarketTime.getTime()
      : typeof regularMarketTime === "number"
        ? regularMarketTime * 1000
        : null;

  return {
    symbol: String(q.symbol ?? ""),
    name: String(q.shortName || q.longName || q.symbol || ""),
    exchange: String(q.fullExchangeName || q.exchange || "—"),
    currency: String(q.currency || "USD"),
    price: num(q.regularMarketPrice),
    change: num(q.regularMarketChange),
    changePercent: num(q.regularMarketChangePercent),
    marketCap: num(q.marketCap),
    marketState: toMarketState(q.marketState),
    asOf,
    postMarketPrice: num(q.postMarketPrice),
    postMarketChange: num(q.postMarketChange),
    postMarketChangePercent: num(q.postMarketChangePercent),
  };
}

/** Fetch live quotes for a list of symbols, cached for CACHE_TTL_MS. */
export async function getQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (unique.length === 0) return [];

  const key = [...unique].sort().join(",");
  return quoteCache.getOrSet(key, async () => {
    try {
      const results = await yahooFinance.quote(unique, { return: "array" });
      return (results as unknown as Record<string, unknown>[]).map(toMarketQuote);
    } catch (err) {
      throw new MarketDataError(
        `Failed to fetch quotes for ${unique.join(", ")}`,
        err
      );
    }
  });
}

/** Smart typeahead search across US, TASE, and other listed instruments. */
export async function searchSymbols(query: string): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return searchCache.getOrSet(`search:${trimmed.toLowerCase()}`, async () => {
    try {
      const result = await yahooFinance.search(trimmed, {
        quotesCount: 8,
        newsCount: 0,
      });
      return (result.quotes as unknown as Record<string, unknown>[])
        .filter((q) => q.isYahooFinance === true && typeof q.symbol === "string")
        .map((q): SearchResultItem => {
          const rawExchange = String(q.exchDisp || q.exchange || "");
          const exchange = toExchangeBadge(rawExchange);
          return {
            symbol: String(q.symbol),
            name: String(q.longname || q.shortname || q.symbol),
            exchange,
            // Search doesn't return currency (only `quote` does) — best-effort
            // badge from exchange, confirmed/corrected once a quote loads.
            currency: guessCurrencyFromExchange(exchange),
            type: String(q.quoteType || "EQUITY"),
          };
        });
    } catch (err) {
      throw new MarketDataError(`Search failed for "${trimmed}"`, err);
    }
  });
}

/** Market Summary: fixed set of major US + TASE indices and Bitcoin. */
export async function getMarketSummary(): Promise<MarketQuote[]> {
  const symbols = MARKET_SUMMARY_SYMBOLS.map((s) => s.symbol);
  const quotes = await getQuotes(symbols);
  const labelBySymbol = new Map(MARKET_SUMMARY_SYMBOLS.map((s) => [s.symbol, s.label]));
  // Preserve the configured order regardless of what the provider returns.
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  return symbols
    .map((symbol) => bySymbol.get(symbol))
    .filter((q): q is MarketQuote => Boolean(q))
    .map((q) => ({ ...q, name: labelBySymbol.get(q.symbol) ?? q.name }));
}

/** Most Active: live US "most actives" screener blended with a curated TASE seed list. */
export async function getMostActive(): Promise<MarketQuote[]> {
  return mostActiveCache.getOrSet("most-active", async () => {
    let usSymbols: string[];
    try {
      const screened = await yahooFinance.screener({
        scrIds: "most_actives",
        count: 6,
      });
      usSymbols = screened.quotes.map((q) => q.symbol);
    } catch {
      usSymbols = US_FALLBACK_SYMBOLS;
    }
    return getQuotes([...usSymbols, ...TASE_SEED_SYMBOLS]);
  });
}
