import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type {
  FundamentalsTimeSeriesBalanceSheetResult,
  FundamentalsTimeSeriesCashFlowResult,
  FundamentalsTimeSeriesFinancialsResult,
} from "yahoo-finance2/modules/fundamentalsTimeSeries";
import { TtlCache } from "./cache";
import { mergeYearsBySource } from "./aggregate";
import { guessCurrencyForSearchResult, toExchangeBadge } from "./exchange";
import { getMockFundamentals } from "./mock-data";
import {
  fetchFmpBalanceSheets,
  fetchFmpBalanceSheetsQuarterly,
  fetchFmpCashFlowStatements,
  fetchFmpCashFlowStatementsQuarterly,
  fetchFmpIncomeStatements,
  fetchFmpIncomeStatementsQuarterly,
  type FmpBalanceSheetStatement,
  type FmpCashFlowStatement,
  type FmpIncomeStatement,
} from "./providers/fmp";
import { fetchSecFinancials } from "./providers/sec-edgar";
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
    quoteType: typeof q.quoteType === "string" ? q.quoteType : null,
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
          // Bug fix (QA Phase 4, re-confirmed still broken live in the
          // Final Polish pass): currency was guessed purely from Yahoo's
          // raw exchange code on the search result. That code is unverified
          // live in this sandbox (network blocked) and evidently isn't a
          // reliable "TLV"/"TASE" match for every TASE hit even when the
          // exchange *badge* renders correctly. guessCurrencyForSearchResult
          // checks the ".TA" symbol suffix first — exact and
          // provider-independent — before falling back to the exchange-code
          // guess, so this can't silently regress to USD again for TASE
          // symbols regardless of exactly what Yahoo's raw code turns out
          // to be.
          const symbol = String(q.symbol);
          const rawExchangeCode = String(q.exchange || q.exchDisp || "");
          const exchange = toExchangeBadge(String(q.exchDisp || q.exchange || ""));
          return {
            symbol,
            name: String(q.longname || q.shortname || q.symbol),
            exchange,
            // Search doesn't return currency (only `quote` does) — best-effort
            // badge from exchange/symbol, confirmed/corrected once a quote loads.
            currency: guessCurrencyForSearchResult(symbol, rawExchangeCode),
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
 * QA investigation (chart bug report — "missing 2022", bars bunched left):
 * couldn't reproduce this against real Yahoo data in this environment
 * (network egress to Yahoo is blocked in this sandbox, same restriction
 * documented on lib/finance/providers/fmp.ts) — the illustrative mock
 * fixtures (mock-data.ts) have no such gap by construction, and every
 * chart's XAxis already defaults to (and now explicitly sets) Recharts'
 * category scale, which spaces bars evenly regardless of a numeric gap in
 * the underlying fiscalYear values — so a missing year wouldn't visually
 * "bunch" the remaining bars, it would just render one fewer bar. If
 * Yahoo's fundamentalsTimeSeries genuinely skips a fiscal year for some
 * ticker (plausible — it has for other fields per this file's other doc
 * comments), the honest fix is *not* to fabricate a $0 bar for that year
 * (that would misrepresent a real company as having zero revenue/assets/
 * cash flow that year, which is worse than a gap) — it's to surface the
 * gap somewhere visible for debugging instead of silently losing it.
 */
function warnIfFiscalYearGaps(label: string, symbol: string, fiscalYears: string[]): void {
  if (process.env.NODE_ENV === "production") return;
  const numericYears = fiscalYears.map(Number).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  for (let i = 1; i < numericYears.length; i++) {
    if (numericYears[i] - numericYears[i - 1] > 1) {
      console.warn(
        `[FinLens] ${label}(${symbol}): fiscal year gap detected — ${numericYears[i - 1]} to ${numericYears[i]} ` +
          `(missing ${numericYears[i] - numericYears[i - 1] - 1} year(s)). This reflects what Yahoo returned; ` +
          `no data was fabricated to fill it.`
      );
    }
  }
}

/**
 * QA fix (Compare tab report: adding AMD left Revenue (TTM)/Revenue Growth/
 * EPS Growth blank while margins and P/E populated fine). Root cause: this
 * used to read `summary.incomeStatementHistory`, a legacy quoteSummary
 * module — the exact same vintage as `balanceSheetHistory`, which this
 * codebase's own toBalanceYears() doc comment already documents as having
 * been stripped by Yahoo to just `{maxAge, endDate}` since Nov 2024. Yahoo
 * applied the same deprecation to incomeStatementHistory, so it silently
 * returns rows with every financial field undefined for many symbols —
 * `income` would then default every field to 0 via `?? 0`, which is
 * indistinguishable from "no data" in downstream consumers (Compare tab,
 * Estimates tab's actualRevenue lookup) and just as easily ends up as an
 * empty array. Migrated to the same reliable `fundamentalsTimeSeries`
 * method (module: "financials", the income-statement equivalent) already
 * used for the quarterly revenue backfill and proven live for balance
 * sheet / cash flow.
 */
/** "2023" for annual rows, "2023-Q2" for quarterly — see quarterLabel(). String-sortable either way (see aggregate.ts). */
type PeriodLabelFn = (date: Date) => string;
const annualLabel: PeriodLabelFn = (date) => String(date.getFullYear());
/** Calendar-quarter label — Yahoo's fundamentalsTimeSeries rows are dated by
 *  period end, so this reads as "the quarter ending in this row's date,"
 *  matching the same "fiscalYear-Qn" convention SEC EDGAR's quarterlySeries
 *  uses (see providers/sec-edgar.ts), so both sources merge cleanly. */
const quarterLabel: PeriodLabelFn = (date) => `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;

/**
 * Maps a single fundamentalsTimeSeries "financials" row into our
 * IncomeStatementYear shape (minus the fiscalYear label, which differs
 * between the annual/quarterly array mapper below and the single-row TTM
 * mapper — see toTrailingIncomeRow). Pulled out into its own function so
 * both call sites share identical field-extraction/fallback logic instead
 * of drifting apart over time.
 */
function mapIncomeRow(
  row: FundamentalsTimeSeriesFinancialsResult,
  summary: QuoteSummaryResult
): Omit<IncomeStatementYear, "fiscalYear"> {
  const sharesOutstandingFallback = summary.defaultKeyStatistics?.sharesOutstanding ?? 0;
  const dividendsPerShareFallback = summary.summaryDetail?.dividendRate ?? 0;
  const grossMarginFallback = summary.financialData?.grossMargins ?? null;
  const operatingMarginFallback = summary.financialData?.operatingMargins ?? null;

  const netIncome = row.netIncome ?? 0;
  const totalRevenue = row.totalRevenue ?? 0;
  const grossProfit =
    row.grossProfit || (grossMarginFallback != null ? Math.round(totalRevenue * grossMarginFallback) : 0);
  const operatingIncome =
    row.operatingIncome ||
    row.EBIT ||
    (operatingMarginFallback != null ? Math.round(totalRevenue * operatingMarginFallback) : 0);
  const sharesOutstanding = row.dilutedAverageShares || sharesOutstandingFallback;
  return {
    totalRevenue,
    grossProfit,
    operatingIncome,
    netIncome,
    eps: row.dilutedEPS ?? (sharesOutstanding > 0 ? Number((netIncome / sharesOutstanding).toFixed(2)) : 0),
    sharesOutstandingDiluted: sharesOutstanding,
    dividendsPerShare: row.dividendPerShare ?? dividendsPerShareFallback,
    dataSource: "yahoo" as const,
  };
}

function toIncomeRows(
  rows: FundamentalsTimeSeriesFinancialsResult[],
  summary: QuoteSummaryResult,
  symbol: string,
  labelFn: PeriodLabelFn,
  label: string
): IncomeStatementYear[] {
  const periods = [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({ fiscalYear: labelFn(row.date), ...mapIncomeRow(row, summary) }))
    // Same "phantom zero-height bar" fix as toBalanceRows/toCashFlowRows —
    // a row with a valid date but every financial field missing shouldn't
    // contribute an empty period to the chart/table.
    .filter((y) => y.totalRevenue !== 0 || y.netIncome !== 0 || y.grossProfit !== 0);

  warnIfFiscalYearGaps(label, symbol, periods.map((y) => y.fiscalYear));
  return periods;
}

/**
 * Rolling-twelve-month row from `fundamentalsTimeSeries({type: "trailing",
 * module: "financials"})` — Yahoo strips the "trailing" prefix the same way
 * it strips "annual"/"quarterly" (confirmed against the installed
 * yahoo-finance2 package's own processResponse() transform), so the row
 * shape is identical to an annual row. Appended as a synthetic "TTM" row
 * onto the end of the merged annual `income` array (see getFundamentals()),
 * matching the reference terminal's behavior of always showing a trailing
 * bar after the fiscal-year history regardless of which Select Range is
 * active — see splitTrailingRow() in chart-transform.ts for how panels pull
 * it back out before range-filtering so it never gets sliced away as one of
 * the "N years".
 */
function toTrailingIncomeRow(
  rows: FundamentalsTimeSeriesFinancialsResult[],
  summary: QuoteSummaryResult
): IncomeStatementYear | null {
  const latest = [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  if (!latest) return null;
  const mapped = mapIncomeRow(latest, summary);
  if (mapped.totalRevenue === 0 && mapped.netIncome === 0 && mapped.grossProfit === 0) return null;
  return { fiscalYear: "TTM", ...mapped };
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
/** Per-row field extraction shared by toBalanceRows and the MRQ derivation in getFundamentals(). */
function mapBalanceRow(row: FundamentalsTimeSeriesBalanceSheetResult): Omit<BalanceSheetYear, "fiscalYear"> {
  return {
    cashAndShortTermInvestments: row.cashCashEquivalentsAndShortTermInvestments ?? row.cashAndCashEquivalents ?? 0,
    totalCurrentAssets: row.currentAssets ?? 0,
    totalCurrentLiabilities: row.currentLiabilities ?? 0,
    totalAssets: row.totalAssets ?? 0,
    totalLiabilities: row.totalLiabilitiesNetMinorityInterest ?? 0,
    totalStockholdersEquity: row.stockholdersEquity ?? row.totalEquityGrossMinorityInterest ?? 0,
    totalCash: row.cashAndCashEquivalents ?? 0,
    totalDebt: row.totalDebt ?? 0,
    dataSource: "yahoo" as const,
  };
}

function toBalanceRows(
  rows: FundamentalsTimeSeriesBalanceSheetResult[],
  symbol: string,
  labelFn: PeriodLabelFn,
  label: string
): BalanceSheetYear[] {
  const periods = [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({ fiscalYear: labelFn(row.date), ...mapBalanceRow(row) }))
    // QA fix (live report: a "2021" axis label rendered with no visible bar
    // on Balance/Cash Flow charts, while every other year rendered fine).
    // Root cause: `row.date instanceof Date` only confirms Yahoo tagged a
    // fiscal year for that row — it says nothing about whether that row
    // actually carries data. For the oldest period in a fundamentalsTimeSeries
    // response, Yahoo not infrequently returns a row with a real date but
    // every financial field genuinely absent (predates a schema field being
    // reported, or the filing just isn't fully indexed) — every `?? 0`
    // fallback above then kicks in, producing a row that's structurally
    // valid but numerically all-zero. That row still contributes its
    // fiscalYear to the array, so Recharts' category axis draws a tick for
    // it — but a bar whose value is 0 renders at zero height, i.e.
    // invisible, which is exactly "a label with no bar." Dropping rows
    // where every meaningful field is 0 removes the phantom tick instead of
    // just hiding the (already-invisible) bar.
    .filter(
      (y) =>
        y.totalAssets !== 0 ||
        y.totalLiabilities !== 0 ||
        y.totalCurrentAssets !== 0 ||
        y.totalCurrentLiabilities !== 0 ||
        y.cashAndShortTermInvestments !== 0
    );
  warnIfFiscalYearGaps(label, symbol, periods.map((y) => y.fiscalYear));
  return periods;
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
/** Per-row field extraction shared by toCashFlowRows and toTrailingCashFlowRow below. */
function mapCashFlowRow(row: FundamentalsTimeSeriesCashFlowResult): Omit<CashFlowYear, "fiscalYear"> {
  return {
    operatingCashFlow: row.operatingCashFlow ?? 0,
    freeCashFlow: row.freeCashFlow ?? 0,
    stockBasedCompensation: row.stockBasedCompensation ?? 0,
    capitalExpenditures: row.capitalExpenditure ?? 0,
    netIncome: row.netIncomeFromContinuingOperations ?? 0,
    dataSource: "yahoo" as const,
  };
}

function toCashFlowRows(
  rows: FundamentalsTimeSeriesCashFlowResult[],
  symbol: string,
  labelFn: PeriodLabelFn,
  label: string
): CashFlowYear[] {
  const periods = [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({ fiscalYear: labelFn(row.date), ...mapCashFlowRow(row) }))
    // QA fix — same root cause as toBalanceYears' matching filter above:
    // a dated-but-otherwise-empty row for the oldest period renders as an
    // axis label with an invisible zero-height bar. Drop it instead.
    .filter((y) => y.operatingCashFlow !== 0 || y.freeCashFlow !== 0 || y.netIncome !== 0);
  warnIfFiscalYearGaps(label, symbol, periods.map((y) => y.fiscalYear));
  return periods;
}

/**
 * Rolling-twelve-month row from `fundamentalsTimeSeries({type: "trailing",
 * module: "cash-flow"})` — same rationale/appending strategy as
 * toTrailingIncomeRow above, labeled "TTM" since cash flow (like income) is
 * a flow statement over a period, not a point-in-time snapshot.
 */
function toTrailingCashFlowRow(rows: FundamentalsTimeSeriesCashFlowResult[]): CashFlowYear | null {
  const latest = [...rows]
    .filter((row) => row.date instanceof Date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  if (!latest) return null;
  const mapped = mapCashFlowRow(latest);
  if (mapped.operatingCashFlow === 0 && mapped.freeCashFlow === 0 && mapped.netIncome === 0) return null;
  return { fiscalYear: "TTM", ...mapped };
}

/**
 * Maps FMP's annual statement endpoints into this app's Year shapes, tagged
 * `dataSource: "fmp"`. Used only as the third-tier layer in the
 * multi-source merge (see aggregate.ts) — superseded the old field-by-field
 * "backfill zeros" enrichment, which only ever patched gaps *within*
 * Yahoo's own ~5-year window. A whole-row merge is both simpler (one merge
 * strategy for all three statements, all three sources) and more capable
 * (FMP rows can now also fill entire fiscal years Yahoo doesn't have, not
 * just individual fields within years it does).
 */
/** "2023" for annual FMP rows, "2023-Q2" for quarterly ones (FMP's `period` field is present only on quarterly responses) — matches the same convention Yahoo/SEC EDGAR quarterly rows use, so all three sources merge cleanly. */
function fmpPeriodKey(r: { calendarYear: string; period?: string }): string {
  return r.period ? `${r.calendarYear}-${r.period}` : r.calendarYear;
}

function fmpIncomeToYears(rows: FmpIncomeStatement[] | null): IncomeStatementYear[] {
  if (!rows) return [];
  return rows
    .filter((r) => r.calendarYear)
    .map((r) => ({
      fiscalYear: fmpPeriodKey(r),
      totalRevenue: r.revenue ?? 0,
      grossProfit: r.grossProfit ?? 0,
      operatingIncome: r.operatingIncome ?? 0,
      netIncome: r.netIncome ?? 0,
      eps: r.epsdiluted ?? 0,
      sharesOutstandingDiluted: r.weightedAverageShsOutDil ?? 0,
      // FMP's income-statement endpoint doesn't include dividends/share.
      dividendsPerShare: 0,
      dataSource: "fmp" as const,
    }));
}

function fmpBalanceToYears(rows: FmpBalanceSheetStatement[] | null): BalanceSheetYear[] {
  if (!rows) return [];
  return rows
    .filter((r) => r.calendarYear)
    .map((r) => ({
      fiscalYear: fmpPeriodKey(r),
      cashAndShortTermInvestments: r.cashAndShortTermInvestments ?? 0,
      totalCurrentAssets: r.totalCurrentAssets ?? 0,
      totalCurrentLiabilities: r.totalCurrentLiabilities ?? 0,
      totalAssets: r.totalAssets ?? 0,
      totalLiabilities: r.totalLiabilities ?? 0,
      totalStockholdersEquity: r.totalStockholdersEquity ?? 0,
      totalCash: r.cashAndCashEquivalents ?? 0,
      totalDebt: r.totalDebt ?? 0,
      dataSource: "fmp" as const,
    }));
}

function fmpCashFlowToYears(rows: FmpCashFlowStatement[] | null): CashFlowYear[] {
  if (!rows) return [];
  return rows
    .filter((r) => r.calendarYear)
    .map((r) => ({
      fiscalYear: fmpPeriodKey(r),
      operatingCashFlow: r.operatingCashFlow ?? 0,
      freeCashFlow: r.freeCashFlow ?? 0,
      stockBasedCompensation: r.stockBasedCompensation ?? 0,
      capitalExpenditures: r.capitalExpenditure ?? 0,
      netIncome: r.netIncome ?? 0,
      dataSource: "fmp" as const,
    }));
}

/**
 * Finds the actual revenue for the quarter nearest a given end date, from
 * quarterly `fundamentalsTimeSeries({module:'financials', type:'quarterly'})`
 * rows. Yahoo's fiscal quarter-end dates don't always land on the exact
 * same day across modules (earningsHistory vs. fundamentalsTimeSeries), so
 * this matches within a 10-day tolerance rather than requiring an exact
 * date match.
 */
function findNearestQuarterlyRevenue(
  rows: FundamentalsTimeSeriesFinancialsResult[],
  targetDate: Date
): number | null {
  const TOLERANCE_MS = 10 * 24 * 60 * 60 * 1000;
  let best: { revenue: number; diff: number } | null = null;
  for (const row of rows) {
    if (!(row.date instanceof Date) || row.totalRevenue == null) continue;
    const diff = Math.abs(row.date.getTime() - targetDate.getTime());
    if (diff > TOLERANCE_MS) continue;
    if (!best || diff < best.diff) best = { revenue: row.totalRevenue, diff };
  }
  return best?.revenue ?? null;
}

/**
 * Maps Yahoo's `earningsTrend` module (forward analyst consensus) into our
 * EstimateRow shape, split into quarterly vs. annual buckets by the
 * `period` label's suffix ("0q"/"+1q" vs "0y"/"+1y"/"+5y"/"-5y"), then
 * enriches the quarterly bucket with genuinely real historical data from
 * `earningsHistory` (trailing ~4 quarters of EPS actual/estimate).
 *
 * Data availability caveat worth flagging clearly: Yahoo's free
 * earningsTrend module typically only carries a handful of near-term
 * periods (current + next quarter, current + next year, a 5y growth
 * estimate) — no historical rows. It does NOT expose point-in-time
 * historical *revenue* consensus at all, at any tier we have access to.
 * Rather than fabricate a revenue-based historical comparison, historical
 * quarterly rows are built from `earningsHistory` (real trailing EPS
 * actual/estimate/surprise — confirmed non-deprecated, no hardcoded-null
 * fields) cross-referenced with real actual quarterly revenue from
 * `fundamentalsTimeSeries`, and honestly labeled `beatBasis: "eps"` since
 * that's what they actually compare. The mock data path (AAPL/NVDA/
 * TEVA.TA) still shows the fuller illustrative revenue-based table for
 * demo purposes, labeled `beatBasis: "revenue"`.
 */
function toEstimates(
  summary: QuoteSummaryResult,
  income: IncomeStatementYear[],
  quarterlyRevenueRows: FundamentalsTimeSeriesFinancialsResult[]
): EstimatesBundle {
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
      // "Mon YYYY" for both quarterly and annual rows (e.g. "Sep 2024") —
      // matches the reference dashboard's fiscal-period labeling, which
      // shows the fiscal year-end month even for annual rows rather than
      // a bare year number.
      fiscalPeriodLabel: t.endDate.toLocaleDateString("en-US", { year: "numeric", month: "short" }),
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
      epsActual: null,
      epsEstimate: null,
      beatBasis: beat != null ? "revenue" : null,
    };

    (isQuarterly ? quarterly : annual).push(row);
  }

  // Enrich with real trailing EPS actual/estimate history — the one
  // genuinely historical, non-fabricated data source Yahoo's free tier
  // exposes for "did the company beat" style questions.
  const existingQuarterlyDates = new Set(quarterly.map((r) => r.periodEndDate));
  for (const h of summary.earningsHistory?.history ?? []) {
    if (!h.quarter) continue;
    const periodEndDate = h.quarter.toISOString().slice(0, 10);
    if (existingQuarterlyDates.has(periodEndDate)) continue; // don't duplicate an earningsTrend row

    const beat = h.epsActual != null && h.epsEstimate != null ? h.epsActual >= h.epsEstimate : null;
    const actualRevenue = findNearestQuarterlyRevenue(quarterlyRevenueRows, h.quarter);
    // QA fix (bug report Issue #4 — "Estimates tab: historical quarters
    // have null consensus fields"): Yahoo's free tier has no point-in-time
    // historical revenue *consensus* to show here (see this function's doc
    // comment), so revenueEstimate/Avg/Low/High/numberOfAnalysts stay
    // honestly null — there's no real forecast data to backfill them with.
    // revenueYoyGrowthPct is different: it's not a consensus figure, it's
    // a straightforward comparison of two *actuals* (this quarter vs. the
    // same calendar quarter a year prior), and we already have the real
    // revenue history via quarterlyRevenueRows — so compute it instead of
    // leaving it null.
    const priorYearQuarter = new Date(h.quarter);
    priorYearQuarter.setFullYear(priorYearQuarter.getFullYear() - 1);
    const priorYearRevenue = findNearestQuarterlyRevenue(quarterlyRevenueRows, priorYearQuarter);
    const revenueYoyGrowthPct =
      actualRevenue != null && priorYearRevenue != null && priorYearRevenue !== 0
        ? Number((((actualRevenue - priorYearRevenue) / Math.abs(priorYearRevenue)) * 100).toFixed(2))
        : null;
    quarterly.push({
      fiscalPeriodLabel: h.quarter.toLocaleDateString("en-US", { year: "numeric", month: "short" }),
      periodEndDate,
      revenueEstimate: null,
      revenueYoyGrowthPct,
      revenueAvg: null,
      revenueLow: null,
      revenueHigh: null,
      numberOfAnalysts: null,
      isHistorical: true,
      beat,
      actualRevenue,
      epsActual: h.epsActual,
      epsEstimate: h.epsEstimate,
      beatBasis: beat != null ? "eps" : null,
    });
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

      // QA fix ("Select Range does nothing" report): this used to be -6,
      // which meant the Select Range dropdown's "10 Years" option could
      // *never* actually show 10 years of data even when Yahoo has it —
      // the fetch itself was already capping the window below that. Bumped
      // to comfortably clear the broadest range the UI offers (see
      // ChartControls' CHART_RANGES), so "10 Years"/"All Available" can
      // genuinely differ from "5 Years" whenever the ticker's real history
      // goes back that far.
      //
      // IMPORTANT caveat (root-caused in a later pass, see the USER_AGENT
      // doc comment in providers/sec-edgar.ts): this period1 window only
      // matters for how far back *Yahoo* is willing to look — it does NOT
      // mean Yahoo will actually return that much. Yahoo's
      // fundamentalsTimeSeries endpoint has a hard backend cap of roughly 4
      // annual periods / 5 quarters regardless of period1 (confirmed
      // against yfinance's own scraper source and multiple independent
      // reports), so real 5/10-year depth depends entirely on SEC EDGAR
      // (providers/sec-edgar.ts) actually succeeding — which itself
      // requires SEC_EDGAR_CONTACT to be set (see .env.local.example) or
      // SEC returns 403 and this whole layer silently contributes nothing.
      const balancePeriod1 = new Date();
      balancePeriod1.setFullYear(balancePeriod1.getFullYear() - 11);

      // Trailing ~2 years is enough to cover earningsHistory's ~4 quarters
      // with room to spare for the nearest-date matching in
      // findNearestQuarterlyRevenue().
      const quarterlyPeriod1 = new Date();
      quarterlyPeriod1.setFullYear(quarterlyPeriod1.getFullYear() - 2);

      const [
        quotes,
        summary,
        chartResult,
        balanceRows,
        cashFlowRows,
        incomeRows,
        quarterlyRevenueRows,
        balanceRowsQuarterly,
        cashFlowRowsQuarterly,
        trailingIncomeRows,
        trailingCashFlowRows,
        secFinancials,
        fmpIncomeRows,
        fmpBalanceRows,
        fmpCashFlowRows,
        fmpIncomeRowsQuarterly,
        fmpBalanceRowsQuarterly,
        fmpCashFlowRowsQuarterly,
      ] = await Promise.all([
        getQuotes([symbol]),
        yahooFinance.quoteSummary(symbol, {
          modules: [
            "assetProfile",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            // Analyst consensus (Phase 5: Estimates tab). Not on Yahoo's
            // deprecated-module list and has no hardcoded-null fields —
            // see toEstimates() doc comment for the real-world caveat that
            // this typically only returns a handful of near-term periods.
            "earningsTrend",
            // Real trailing EPS actual/estimate/surprise (~4 quarters) —
            // used to give the Estimates tab genuine historical beat/miss
            // rows on the live path. See toEstimates() doc comment.
            "earningsHistory",
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
        // Annual income-statement data — see toIncomeYears() doc comment
        // for why this replaced quoteSummary's deprecated
        // `incomeStatementHistory` module (dropped from the modules list
        // above entirely now that nothing reads it).
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: balancePeriod1,
            type: "annual",
            module: "financials",
          })
          .catch(() => [] as FundamentalsTimeSeriesFinancialsResult[]),
        // Real quarterly actual revenue, used both to backfill the
        // "Actual" figure next to earningsHistory's historical EPS rows
        // (see findNearestQuarterlyRevenue()) AND as the quarterly Income
        // Statement source for the Chart Type: Quarterly view below — same
        // module, no need for a second fetch.
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: quarterlyPeriod1,
            type: "quarterly",
            module: "financials",
          })
          .catch(() => [] as FundamentalsTimeSeriesFinancialsResult[]),
        // Quarterly balance sheet / cash flow — Chart Type: Quarterly view.
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: quarterlyPeriod1,
            type: "quarterly",
            module: "balance-sheet",
          })
          .catch(() => [] as FundamentalsTimeSeriesBalanceSheetResult[]),
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: quarterlyPeriod1,
            type: "quarterly",
            module: "cash-flow",
          })
          .catch(() => [] as FundamentalsTimeSeriesCashFlowResult[]),
        // Trailing-twelve-month (TTM) rows — appended as a synthetic "TTM"
        // row after the real fiscal-year history (see toTrailingIncomeRow/
        // toTrailingCashFlowRow above and splitTrailingRow() in
        // chart-transform.ts). Same period1 window as the quarterly fetches
        // above is plenty since Yahoo only ever returns the single latest
        // trailing period regardless of how far back period1 goes.
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: quarterlyPeriod1,
            type: "trailing",
            module: "financials",
          })
          .catch(() => [] as FundamentalsTimeSeriesFinancialsResult[]),
        yahooFinance
          .fundamentalsTimeSeries(symbol, {
            period1: quarterlyPeriod1,
            type: "trailing",
            module: "cash-flow",
          })
          .catch(() => [] as FundamentalsTimeSeriesCashFlowResult[]),
        // Multi-source aggregation, primary deep-history layer (see
        // aggregate.ts / providers/sec-edgar.ts doc comments) — audited
        // XBRL data straight from 10-K/20-F filings, the only source that
        // can genuinely back a "10 Years"/"All Available" range selection
        // for an established filer. fetchSecFinancials() never throws (its
        // own try/catch resolves a well-formed { status: "unavailable" }
        // result), caught here too only for defense-in-depth consistency
        // with the other independently-caught fetches above.
        fetchSecFinancials(symbol).catch(
          () => ({
            status: "unavailable" as const,
            income: [],
            balance: [],
            cashFlow: [],
            incomeQuarterly: [],
            balanceQuarterly: [],
            cashFlowQuarterly: [],
          })
        ),
        // Multi-source aggregation, third-tier layer — no-op (resolves
        // null almost instantly) unless FMP_API_KEY is configured; see
        // providers/fmp.ts.
        fetchFmpIncomeStatements(symbol).catch(() => null),
        fetchFmpBalanceSheets(symbol).catch(() => null),
        fetchFmpCashFlowStatements(symbol).catch(() => null),
        fetchFmpIncomeStatementsQuarterly(symbol).catch(() => null),
        fetchFmpBalanceSheetsQuarterly(symbol).catch(() => null),
        fetchFmpCashFlowStatementsQuarterly(symbol).catch(() => null),
      ]);

      const quote = quotes[0];
      if (!quote || quote.price == null) {
        throw new MarketDataError(`No live quote for ${symbol}`);
      }

      const assetProfile = summary.assetProfile;

      const yahooIncome = toIncomeRows(incomeRows as FundamentalsTimeSeriesFinancialsResult[], summary, symbol, annualLabel, "toIncomeRows");
      const yahooBalance = toBalanceRows(balanceRows as FundamentalsTimeSeriesBalanceSheetResult[], symbol, annualLabel, "toBalanceRows");
      const yahooCashFlow = toCashFlowRows(cashFlowRows as FundamentalsTimeSeriesCashFlowResult[], symbol, annualLabel, "toCashFlowRows");

      // Multi-source aggregation (see aggregate.ts): for each fiscal year,
      // SEC EDGAR's audited deep history wins when it has that year, Yahoo
      // fills recent years and any ticker SEC doesn't register, FMP fills
      // whatever isolated gap remains. Every row keeps a `dataSource` tag
      // for the UI attribution badge (see Income/Balance/CashFlow panels).
      const income = mergeYearsBySource("income", symbol, [
        { source: "sec-edgar", years: secFinancials.income },
        { source: "yahoo", years: yahooIncome },
        { source: "fmp", years: fmpIncomeToYears(fmpIncomeRows) },
      ]);
      const balance = mergeYearsBySource("balance", symbol, [
        { source: "sec-edgar", years: secFinancials.balance },
        { source: "yahoo", years: yahooBalance },
        { source: "fmp", years: fmpBalanceToYears(fmpBalanceRows) },
      ]);
      const cashFlow = mergeYearsBySource("cashFlow", symbol, [
        { source: "sec-edgar", years: secFinancials.cashFlow },
        { source: "yahoo", years: yahooCashFlow },
        { source: "fmp", years: fmpCashFlowToYears(fmpCashFlowRows) },
      ]);

      // Trailing-twelve-month appendix — appended directly onto the merged
      // annual arrays as a final "TTM" row (same convention mock-data.ts
      // already uses for its illustrative fixtures), NOT merged through
      // mergeYearsBySource since TTM is a Yahoo-only rolling computation,
      // not a fiscal year any source "has" or "is missing". Panels split it
      // back out before Select Range filtering (see splitTrailingRow() in
      // chart-transform.ts) so it's always shown regardless of range,
      // matching the reference terminal's behavior. SEC EDGAR has no TTM
      // concept (audited filings only), so this is deliberately Yahoo-only.
      const incomeTrailing = toTrailingIncomeRow(trailingIncomeRows as FundamentalsTimeSeriesFinancialsResult[], summary);
      if (incomeTrailing) income.push(incomeTrailing);
      const cashFlowTrailing = toTrailingCashFlowRow(trailingCashFlowRows as FundamentalsTimeSeriesCashFlowResult[]);
      if (cashFlowTrailing) cashFlow.push(cashFlowTrailing);

      // Quarterly counterparts — Chart Type: Quarterly view. Same merge
      // priority (SEC EDGAR 10-Qs > Yahoo > FMP), keyed "fiscalYear-Qn"
      // instead of a bare year (see quarterLabel()/quarterlySeries()).
      // Foreign private issuers (20-F filers) generally don't file 10-Qs,
      // so `secFinancials.*Quarterly` is often empty for them — Yahoo/FMP
      // still cover that case.
      const yahooIncomeQuarterly = toIncomeRows(
        quarterlyRevenueRows as FundamentalsTimeSeriesFinancialsResult[],
        summary,
        symbol,
        quarterLabel,
        "toIncomeRows(quarterly)"
      );
      const yahooBalanceQuarterly = toBalanceRows(
        balanceRowsQuarterly as FundamentalsTimeSeriesBalanceSheetResult[],
        symbol,
        quarterLabel,
        "toBalanceRows(quarterly)"
      );
      const yahooCashFlowQuarterly = toCashFlowRows(
        cashFlowRowsQuarterly as FundamentalsTimeSeriesCashFlowResult[],
        symbol,
        quarterLabel,
        "toCashFlowRows(quarterly)"
      );
      const incomeQuarterly = mergeYearsBySource("incomeQuarterly", symbol, [
        { source: "sec-edgar", years: secFinancials.incomeQuarterly },
        { source: "yahoo", years: yahooIncomeQuarterly },
        { source: "fmp", years: fmpIncomeToYears(fmpIncomeRowsQuarterly) },
      ]);
      const balanceQuarterly = mergeYearsBySource("balanceQuarterly", symbol, [
        { source: "sec-edgar", years: secFinancials.balanceQuarterly },
        { source: "yahoo", years: yahooBalanceQuarterly },
        { source: "fmp", years: fmpBalanceToYears(fmpBalanceRowsQuarterly) },
      ]);
      const cashFlowQuarterly = mergeYearsBySource("cashFlowQuarterly", symbol, [
        { source: "sec-edgar", years: secFinancials.cashFlowQuarterly },
        { source: "yahoo", years: yahooCashFlowQuarterly },
        { source: "fmp", years: fmpCashFlowToYears(fmpCashFlowRowsQuarterly) },
      ]);

      // Most Recent Quarter (MRQ) appendix for the Balance Sheet panel —
      // unlike income/cash flow (flow statements, where "trailing twelve
      // months" is the natural rolling figure), a balance sheet is a
      // point-in-time snapshot, so its trailing appendix is simply the
      // latest quarter already fetched above, relabeled "MRQ" rather than
      // re-fetched. `balanceQuarterly` is lexicographically sorted by
      // "fiscalYear-Qn" (see mergeYearsBySource), so the last entry is the
      // most recent quarter. Appended the same way as income/cashFlow's TTM
      // row — see splitTrailingRow() in chart-transform.ts.
      const latestQuarter = balanceQuarterly[balanceQuarterly.length - 1];
      if (latestQuarter) {
        balance.push({ ...latestQuarter, fiscalYear: "MRQ" });
      }

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
        balance,
        cashFlow,
        incomeQuarterly,
        balanceQuarterly,
        cashFlowQuarterly,
        estimates: toEstimates(summary, income, quarterlyRevenueRows as FundamentalsTimeSeriesFinancialsResult[]),
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
