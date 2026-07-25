import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type {
  FundamentalsTimeSeriesBalanceSheetResult,
  FundamentalsTimeSeriesCashFlowResult,
} from "yahoo-finance2/modules/fundamentalsTimeSeries";
import { TtlCache } from "./cache";
import { guessCurrencyFromExchange, toExchangeBadge } from "./exchange";
import { getMockFundamentals } from "./mock-data";
import { fetchFmpCashFlowStatements, isFmpConfigured } from "./providers/fmp";
import { MARKET_SUMMARY_SYMBOLS, TASE_SEED_SYMBOLS, US_FALLBACK_SYMBOLS } from "./symbols";
import {
  MarketDataError,
  type BalanceSheetYear,
  type CashFlowYear,
  type EstimateRow,
  type EstimatesBundle,
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
          // Bug fix (QA Phase 4): currency was being guessed from the
          // human-readable display badge (e.g. "Tel Aviv"), which never
          // matches EXCHANGE_CURRENCY's short-code keys and silently fell
          // back to USD for every TASE result. Guess from the raw short
          // exchange code (`q.exchange`, e.g. "TLV") instead, and only use
          // the display name as a last resort for the *label*, not currency.
          const rawExchangeCode = String(q.exchange || q.exchDisp || "");
          const exchange = toExchangeBadge(String(q.exchDisp || q.exchange || ""));
          return {
            symbol: String(q.symbol),
            name: String(q.longname || q.shortname || q.symbol),
            exchange,
            // Search doesn't return currency (only `quote` does) — best-effort
            // badge from exchange, confirmed/corrected once a quote loads.
            currency: guessCurrencyFromExchange(rawExchangeCode),
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
      priceToFreeCashFlow:
        marketCap && freeCashflow ? Number((marketCap / freeCashflow).toFixed(2)) : null,
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
 * Maps up to ~4 years of classic incomeStatementHistory rows.
 *
 * QA hotfix (Phase 4): `operatingIncome` bars were rendering as a flat
 * zero line live. Root cause, confirmed against yahoo-finance2's own type
 * declarations: `IncomeStatementHistoryElement.operatingIncome` is
 * hard-typed as literal `null` — Yahoo's classic incomeStatementHistory
 * endpoint simply doesn't populate that field on the wire, for any ticker.
 * `ebit` was meant to be the fallback for exactly that reason, but in
 * practice `grossProfit`/`ebit` are also frequently null/0 for tickers
 * where Yahoo has trimmed this legacy module down. Rather than trust
 * either field blindly, fall back to deriving both from the TTM margins
 * we already fetch via `financialData` (same numbers already powering the
 * Margins accordion, which QA confirmed render correctly) applied to that
 * year's revenue. Approximate — margins drift year to year — but always a
 * realistic, non-zero bar instead of a flat line. EPS and dividends/share
 * aren't provided per-year at all here, so both are derived from the
 * current sharesOutstanding/dividendRate — likewise an approximation, not
 * a precise historical figure.
 */
function toIncomeYears(summary: QuoteSummaryResult): IncomeStatementYear[] {
  const rows = summary.incomeStatementHistory?.incomeStatementHistory ?? [];
  const sharesOutstanding = summary.defaultKeyStatistics?.sharesOutstanding ?? 0;
  const dividendsPerShare = summary.summaryDetail?.dividendRate ?? 0;
  const grossMarginFallback = summary.financialData?.grossMargins ?? null;
  const operatingMarginFallback = summary.financialData?.operatingMargins ?? null;

  return [...rows]
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
    .map((row) => {
      const netIncome = row.netIncome ?? 0;
      const totalRevenue = row.totalRevenue ?? 0;
      const grossProfit =
        row.grossProfit ||
        (grossMarginFallback != null ? Math.round(totalRevenue * grossMarginFallback) : 0);
      const operatingIncome =
        row.ebit ||
        (operatingMarginFallback != null ? Math.round(totalRevenue * operatingMarginFallback) : 0);
      return {
        fiscalYear: String(row.endDate.getFullYear()),
        totalRevenue,
        grossProfit,
        operatingIncome,
        netIncome,
        eps: sharesOutstanding > 0 ? Number((netIncome / sharesOutstanding).toFixed(2)) : 0,
        sharesOutstandingDiluted: sharesOutstanding,
        dividendsPerShare,
      };
    });
}

/**
 * Maps annual balance-sheet rows from the `fundamentalsTimeSeries` method.
 *
 * Deliberately NOT using quoteSummary's `balanceSheetHistory` module —
 * confirmed via yahoo-finance2's own source comments and runtime AJV
 * schema (`additionalProperties: false`) that Yahoo has stripped that
 * legacy endpoint down to just `{ maxAge, endDate }` since Nov 2024; every
 * financial field would silently come back as `undefined`. The library's
 * own recommendation is `fundamentalsTimeSeries` instead, whose result
 * rows come back with the "annual"/"quarterly" prefix already stripped
 * (e.g. `totalAssets`, not `annualTotalAssets` — verified against the
 * module's transform code, not just its stale doc-comment examples).
 */
function toBalanceYears(rows: FundamentalsTimeSeriesBalanceSheetResult[]): BalanceSheetYear[] {
  return [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({
      fiscalYear: String(row.date.getFullYear()),
      cashAndShortTermInvestments:
        row.cashCashEquivalentsAndShortTermInvestments ?? row.cashAndCashEquivalents ?? 0,
      totalCurrentAssets: row.currentAssets ?? 0,
      totalCurrentLiabilities: row.currentLiabilities ?? 0,
      totalAssets: row.totalAssets ?? 0,
      totalLiabilities: row.totalLiabilitiesNetMinorityInterest ?? 0,
      totalStockholdersEquity: row.stockholdersEquity ?? row.totalEquityGrossMinorityInterest ?? 0,
      totalCash: row.cashAndCashEquivalents ?? 0,
      totalDebt: row.totalDebt ?? 0,
    }));
}

/**
 * Maps annual cash-flow rows from `fundamentalsTimeSeries({module: 'cash-flow'})`.
 * Same rationale as toBalanceYears() — the legacy quoteSummary
 * cashflowStatementHistory module is on Yahoo's own "gutted since Nov
 * 2024" list, so this uses the recommended replacement instead. Field
 * names verified directly against fundamentalsTimeSeries.d.ts (all typed
 * `?: number`, none hardcoded-null): operatingCashFlow, freeCashFlow,
 * stockBasedCompensation, capitalExpenditure. Sign convention preserved
 * as-is from the provider rather than normalized: SBC comes back positive
 * (a non-cash addback to net income), capex comes back negative (an
 * investing outflow) — the UI renders each with its natural sign.
 *
 * Note: the cash-flow module has no plain `netIncome` field (unlike the
 * balance-sheet/financials modules) — its closest equivalent is
 * `netIncomeFromContinuingOperations`, confirmed against the same .d.ts.
 */
function toCashFlowYears(rows: FundamentalsTimeSeriesCashFlowResult[]): CashFlowYear[] {
  return [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({
      fiscalYear: String(row.date.getFullYear()),
      operatingCashFlow: row.operatingCashFlow ?? 0,
      freeCashFlow: row.freeCashFlow ?? 0,
      stockBasedCompensation: row.stockBasedCompensation ?? 0,
      capitalExpenditures: row.capitalExpenditure ?? 0,
      netIncome: row.netIncomeFromContinuingOperations ?? 0,
    }));
}

/**
 * Backfills any fiscal year where Yahoo's cash-flow rows came back missing
 * stock-based comp or capex (0, since toCashFlowYears defaults to 0), using
 * FMP's annual cash-flow-statement endpoint keyed by fiscal year. No-op
 * (returns the input unchanged) when FMP isn't configured — see
 * lib/finance/providers/fmp.ts for why this can't be verified live here.
 */
async function enrichCashFlowWithFmp(symbol: string, years: CashFlowYear[]): Promise<CashFlowYear[]> {
  if (!isFmpConfigured()) return years;
  const needsEnrichment = years.some(
    (y) => y.stockBasedCompensation === 0 || y.capitalExpenditures === 0
  );
  if (!needsEnrichment) return years;

  const fmpRows = await fetchFmpCashFlowStatements(symbol, years.length + 2).catch(() => null);
  if (!fmpRows || fmpRows.length === 0) return years;

  const fmpByYear = new Map(fmpRows.map((r) => [r.calendarYear, r]));
  return years.map((y) => {
    const fmp = fmpByYear.get(y.fiscalYear);
    if (!fmp) return y;
    return {
      ...y,
      stockBasedCompensation: y.stockBasedCompensation || fmp.stockBasedCompensation || 0,
      capitalExpenditures: y.capitalExpenditures || fmp.capitalExpenditure || 0,
    };
  });
}

/**
 * Maps Yahoo's `earningsTrend` module (forward analyst consensus) into our
 * EstimateRow shape, split into quarterly vs. annual buckets by the
 * `period` label's suffix ("0q"/"+1q" vs "0y"/"+1y"/"+5y"/"-5y").
 *
 * Data availability caveat worth flagging clearly: Yahoo's free
 * earningsTrend module typically only carries a handful of near-term
 * periods (current + next quarter, current + next year, a 5y growth
 * estimate) — not the rich multi-year historical-plus-forward table shown
 * in polished reference dashboards. The UI is built to render gracefully
 * with however many rows actually come back live; the mock data path
 * (AAPL/NVDA/TEVA.TA) provides the fuller illustrative table.
 *
 * "Beat" flagging for historical periods compares actual reported revenue
 * (from `income`) against whatever consensus Yahoo still has on file for
 * that period today — Yahoo doesn't expose point-in-time historical
 * consensus, so this is "actual vs. today's settled estimate," a
 * reasonable proxy rather than a precise at-the-time surprise calculation.
 */
function toEstimates(summary: QuoteSummaryResult, income: IncomeStatementYear[]): EstimatesBundle {
  const trend = summary.earningsTrend?.trend ?? [];
  const today = new Date();
  const actualRevenueByYear = new Map(income.map((y) => [y.fiscalYear, y.totalRevenue]));

  const quarterly: EstimateRow[] = [];
  const annual: EstimateRow[] = [];

  for (const t of trend) {
    if (!t.endDate) continue;
    const isQuarterly = t.period.endsWith("q");
    const isHistorical = t.endDate.getTime() < today.getTime();
    const fiscalYearKey = String(t.endDate.getFullYear());
    const actualRevenue = isHistorical ? (actualRevenueByYear.get(fiscalYearKey) ?? null) : null;
    const revenueEstimate = t.revenueEstimate?.avg ?? null;
    const beat =
      isHistorical && actualRevenue != null && revenueEstimate != null
        ? actualRevenue >= revenueEstimate
        : null;

    const row: EstimateRow = {
      fiscalPeriodLabel: isQuarterly
        ? t.endDate.toLocaleDateString("en-US", { year: "numeric", month: "short" })
        : String(t.endDate.getFullYear()),
      periodEndDate: t.endDate.toISOString().slice(0, 10),
      revenueEstimate,
      revenueYoyGrowthPct:
        t.revenueEstimate?.growth != null ? Number((t.revenueEstimate.growth * 100).toFixed(2)) : null,
      revenueAvg: t.revenueEstimate?.avg ?? null,
      revenueLow: t.revenueEstimate?.low ?? null,
      revenueHigh: t.revenueEstimate?.high ?? null,
      numberOfAnalysts: t.revenueEstimate?.numberOfAnalysts ?? null,
      isHistorical,
      beat,
      actualRevenue,
    };

    (isQuarterly ? quarterly : annual).push(row);
  }

  const byDate = (a: EstimateRow, b: EstimateRow) => a.periodEndDate.localeCompare(b.periodEndDate);
  return { quarterly: quarterly.sort(byDate), annual: annual.sort(byDate) };
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

      const balancePeriod1 = new Date();
      balancePeriod1.setFullYear(balancePeriod1.getFullYear() - 6);

      const [quotes, summary, chartResult, balanceRows, cashFlowRows] = await Promise.all([
        getQuotes([symbol]),
        yahooFinance.quoteSummary(symbol, {
          modules: [
            "assetProfile",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "incomeStatementHistory",
            // Analyst consensus (Phase 5: Estimates tab). Not on Yahoo's
            // deprecated-module list and has no hardcoded-null fields —
            // see toEstimates() doc comment for the real-world caveat that
            // this typically only returns a handful of near-term periods.
            "earningsTrend",
          ],
        }),
        yahooFinance.chart(symbol, { period1, interval: "1d" }),
        // Balance sheet data comes from a separate top-level method, not a
        // quoteSummary module (see toBalanceYears() doc comment). Caught
        // independently so a balance-sheet-only hiccup doesn't fall the
        // entire bundle back to mock data when the rest loaded fine.
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: balancePeriod1,
            type: "annual",
            module: "balance-sheet",
          })
          .catch(() => [] as FundamentalsTimeSeriesBalanceSheetResult[]),
        // Same rationale as balanceRows — see toCashFlowYears() doc comment.
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: balancePeriod1,
            type: "annual",
            module: "cash-flow",
          })
          .catch(() => [] as FundamentalsTimeSeriesCashFlowResult[]),
      ]);

      const quote = quotes[0];
      if (!quote || quote.price == null) {
        throw new MarketDataError(`No live quote for ${symbol}`);
      }

      const assetProfile = summary.assetProfile;
      const income = toIncomeYears(summary);
      const cashFlowYears = toCashFlowYears(cashFlowRows as FundamentalsTimeSeriesCashFlowResult[]);
      // Best-effort enrichment — no-op unless FMP_API_KEY is set (see
      // enrichCashFlowWithFmp doc comment and providers/fmp.ts).
      const cashFlow = await enrichCashFlowWithFmp(symbol, cashFlowYears);

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
        income,
        balance: toBalanceYears(balanceRows as FundamentalsTimeSeriesBalanceSheetResult[]),
        cashFlow,
        estimates: toEstimates(summary, income),
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
