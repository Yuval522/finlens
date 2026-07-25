import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import { TtlCache } from "./cache";
import { guessCurrencyFromExchange, toExchangeBadge } from "./exchange";
import { getMockFundamentals } from "./mock-data";
import { MARKET_SUMMARY_SYMBOLS, TASE_SEED_SYMBOLS, US_FALLBACK_SYMBOLS } from "./symbols";
import {
  MarketDataError,
  type FundamentalsBundle,
  type IncomeStatementYear,
  type MarketQuote,
  type MarketState,
  type PricePoint,
  type SearchResultItem,
} from "./types";

// Server-only module: never import this file from a "use client" component.
// (yahoo-finance2 needs Node APIs and has no business shipping to the browser.)

const CACHE_TTL_MS = Number(process.env.MARKET_DATA_CACHE_TTL_MS ?? 20_000);

const yahooFinance = new YahooFinance();

const quoteCache = new TtlCache<MarketQuote[]>(CACHE_TTL_MS);
const searchCache = new TtlCache<SearchResultItem[]>(CACHE_TTL_MS);
const mostActiveCache = new TtlCache<MarketQuote[]>(CACHE_TTL_MS);
// Fundamentals change slowly and historical bars are heavier to fetch —
// cache them longer than live quotes.
const fundamentalsCache = new TtlCache<FundamentalsBundle>(CACHE_TTL_MS * 15);

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
    timezone:
      typeof q.exchangeTimezoneName === "string" ? q.exchangeTimezoneName : null,
    preMarketPrice: num(q.preMarketPrice),
    preMarketChange: num(q.preMarketChange),
    preMarketChangePercent: num(q.preMarketChangePercent),
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

// ---------------------------------------------------------------------------
// Fundamentals (company profile, valuation metrics, income statement,
// historical price series) for the ticker analysis page.
// ---------------------------------------------------------------------------

function findCeo(assetProfile: QuoteSummaryResult["assetProfile"]): string | null {
  const officers = assetProfile?.companyOfficers ?? [];
  const ceo = officers.find((o) => /chief executive officer|\bceo\b/i.test(o.title ?? ""));
  return ceo?.name ?? null;
}

/**
 * Maps quoteSummary's financialData/summaryDetail/defaultKeyStatistics into
 * our four metric groups. Note: Yahoo's dividendYield/payoutRatio/margin
 * fields are assumed to be fractions (0.045 = 4.5%) based on this library's
 * historical behavior — unverified live in this environment (network
 * blocked here), so spot-check against a real quote before trusting the
 * exact scale.
 */
function toMetrics(summary: QuoteSummaryResult) {
  const summaryDetail = summary.summaryDetail;
  const keyStats = summary.defaultKeyStatistics;
  const fin = summary.financialData;

  const marketCap = summaryDetail?.marketCap ?? null;
  const operatingCashflow = fin?.operatingCashflow ?? null;
  const freeCashflow = fin?.freeCashflow ?? null;
  const trailingPE = summaryDetail?.trailingPE ?? null;
  const totalCash = fin?.totalCash ?? null;
  const totalDebt = fin?.totalDebt ?? null;

  return {
    financials: {
      marketCap,
      peRatio: trailingPE,
      forwardPE: summaryDetail?.forwardPE ?? keyStats?.forwardPE ?? null,
      forwardPeg: keyStats?.pegRatio ?? null,
      priceToCashFlow:
        marketCap && operatingCashflow
          ? Number((marketCap / operatingCashflow).toFixed(2))
          : null,
    },
    yields: {
      earningsYield: trailingPE ? Number((100 / trailingPE).toFixed(2)) : null,
      cashFlowYield:
        marketCap && operatingCashflow
          ? Number(((operatingCashflow / marketCap) * 100).toFixed(2))
          : null,
      freeCashFlowYield:
        marketCap && freeCashflow
          ? Number(((freeCashflow / marketCap) * 100).toFixed(2))
          : null,
      dividendYield:
        summaryDetail?.dividendYield != null
          ? Number((summaryDetail.dividendYield * 100).toFixed(2))
          : 0,
      payoutRatio:
        summaryDetail?.payoutRatio != null
          ? Number((summaryDetail.payoutRatio * 100).toFixed(2))
          : 0,
    },
    balances: {
      totalCash,
      totalDebt,
      netCashPosition:
        totalCash != null && totalDebt != null ? totalCash - totalDebt : null,
    },
    margins: {
      grossMargin: fin?.grossMargins != null ? Number((fin.grossMargins * 100).toFixed(2)) : null,
      operatingMargin:
        fin?.operatingMargins != null ? Number((fin.operatingMargins * 100).toFixed(2)) : null,
      netIncomeMargin:
        fin?.profitMargins != null ? Number((fin.profitMargins * 100).toFixed(2)) : null,
    },
  };
}

/**
 * Maps up to ~4 years of classic incomeStatementHistory rows. `operatingIncome`
 * uses `ebit` as a close proxy (Yahoo nulls out the dedicated field on this
 * endpoint). EPS and dividends/share aren't provided per-year here, so both
 * are derived from the current sharesOutstanding/dividendRate — an
 * approximation, not a precise historical figure.
 */
function toIncomeYears(summary: QuoteSummaryResult): IncomeStatementYear[] {
  const rows = summary.incomeStatementHistory?.incomeStatementHistory ?? [];
  const sharesOutstanding = summary.defaultKeyStatistics?.sharesOutstanding ?? 0;
  const dividendsPerShare = summary.summaryDetail?.dividendRate ?? 0;

  return [...rows]
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
    .map((row) => {
      const netIncome = row.netIncome ?? 0;
      return {
        fiscalYear: String(row.endDate.getFullYear()),
        totalRevenue: row.totalRevenue ?? 0,
        grossProfit: row.grossProfit ?? 0,
        operatingIncome: row.ebit ?? 0,
        netIncome,
        eps: sharesOutstanding > 0 ? Number((netIncome / sharesOutstanding).toFixed(2)) : 0,
        sharesOutstandingDiluted: sharesOutstanding,
        dividendsPerShare,
      };
    });
}

function toPricePoints(chart: ChartResultArray): PricePoint[] {
  const points: PricePoint[] = [];
  for (const q of chart.quotes) {
    if (typeof q.close !== "number") continue;
    points.push({
      date: q.date.toISOString().slice(0, 10),
      open: typeof q.open === "number" ? q.open : q.close,
      high: typeof q.high === "number" ? q.high : q.close,
      low: typeof q.low === "number" ? q.low : q.close,
      close: q.close,
    });
  }
  return points;
}

/**
 * Full ticker analysis bundle: quote, company profile, valuation metrics,
 * income statement history, and ~10y of daily price bars. Falls back to
 * curated mock data (AAPL, NVDA, TEVA.TA only) if the live provider is
 * unreachable or the symbol isn't covered — see lib/finance/mock-data.ts.
 */
export async function getFundamentals(symbolRaw: string): Promise<FundamentalsBundle> {
  const symbol = symbolRaw.trim();
  if (!symbol) throw new MarketDataError("No symbol provided");

  return fundamentalsCache.getOrSet(`fundamentals:${symbol.toUpperCase()}`, async () => {
    try {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 10);

      const [quotes, summary, chartResult] = await Promise.all([
        getQuotes([symbol]),
        yahooFinance.quoteSummary(symbol, {
          modules: [
            "assetProfile",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "incomeStatementHistory",
          ],
        }),
        yahooFinance.chart(symbol, { period1, interval: "1d" }),
      ]);

      const quote = quotes[0];
      if (!quote || quote.price == null) {
        throw new MarketDataError(`No live quote for ${symbol}`);
      }

      const assetProfile = summary.assetProfile;

      const bundle: FundamentalsBundle = {
        source: "live",
        reportingCurrency: summary.financialData?.financialCurrency || quote.currency,
        quote,
        profile: {
          sector: assetProfile?.sector ?? null,
          industry: assetProfile?.industry ?? null,
          website: assetProfile?.website ?? null,
          ceo: findCeo(assetProfile),
          description: assetProfile?.longBusinessSummary ?? null,
        },
        metrics: toMetrics(summary),
        income: toIncomeYears(summary),
        history: toPricePoints(chartResult),
      };
      return bundle;
    } catch (err) {
      const mock = getMockFundamentals(symbol);
      if (mock) return mock;
      throw err instanceof MarketDataError
        ? err
        : new MarketDataError(`Unable to load fundamentals for ${symbol}`, err);
    }
  });
}
