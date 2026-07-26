/**
 * SEC EDGAR — real, free, keyless public filing data used by the Reports
 * tab. Unlike FMP (lib/finance/providers/fmp.ts), this needs no API key at
 * all: EDGAR's JSON endpoints are open to anyone who sends a proper,
 * identifying User-Agent header (SEC's fair-access policy — requests
 * without one get blocked). We default to a generic app-identifying
 * string but let it be overridden via SEC_EDGAR_CONTACT env var so a real
 * deployment can put a real contact email in it, which is what SEC
 * actually asks for and reduces the odds of the shared default getting
 * rate-limited if many people run this app unmodified.
 *
 * IMPORTANT — unverified live in this environment: outbound network access
 * to data.sec.gov / www.sec.gov is blocked by this sandbox's egress proxy
 * (the same restriction already documented for Yahoo Finance and FMP), so
 * these calls could not be exercised end-to-end here. The request shapes
 * below follow SEC's publicly documented EDGAR APIs. Spot-check against a
 * real deployment before relying on it, the same way you would for any
 * third-party integration built without the ability to hit the real
 * endpoint during development.
 */

import type { BalanceSheetYear, CashFlowYear, IncomeStatementYear } from "../types";

const USER_AGENT = process.env.SEC_EDGAR_CONTACT || "FinLens/1.0 (contact: set SEC_EDGAR_CONTACT env var)";

let tickerMapPromise: Promise<Map<string, { cik: number; name: string }> | null> | null = null;

/**
 * SEC's full ticker->CIK map (~800KB, all US-listed/SEC-registered
 * filers). Fetched once per server lifetime and cached in-memory — this
 * list changes rarely enough that a TTL isn't worth the added complexity.
 */
async function getTickerMap(): Promise<Map<string, { cik: number; name: string }> | null> {
  if (!tickerMapPromise) {
    tickerMapPromise = (async () => {
      try {
        const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
          headers: { "User-Agent": USER_AGENT },
          next: { revalidate: 86400 }, // filers list changes rarely — daily is plenty
        });
        if (!res.ok) return null;
        const raw = (await res.json()) as Record<
          string,
          { cik_str: number; ticker: string; title: string }
        >;
        const map = new Map<string, { cik: number; name: string }>();
        for (const entry of Object.values(raw)) {
          map.set(entry.ticker.toUpperCase(), { cik: entry.cik_str, name: entry.title });
        }
        return map;
      } catch {
        return null;
      }
    })();
  }
  return tickerMapPromise;
}

/**
 * Strips exchange suffixes (".TA", ".L", etc.) to get the bare ticker SEC's
 * map is keyed by — SEC only covers US-listed / SEC-registered filers, so
 * this is a best-effort match (e.g. "TEVA.TA" -> "TEVA", which *does*
 * resolve, since Teva files 20-F/6-K with the SEC as a foreign private
 * issuer under its US ADR ticker).
 */
function bareSymbol(symbol: string): string {
  return symbol.split(".")[0].toUpperCase();
}

export interface FilingRecord {
  form: string;
  filingDate: string;
  reportDate: string | null;
  description: string | null;
  accessionNumber: string;
  /** Direct link to the primary filing document on SEC EDGAR. */
  url: string;
}

const REPORT_FORM_TYPES = new Set(["10-K", "10-Q", "20-F", "6-K", "10-K/A", "10-Q/A"]);

/**
 * QA fix (live report: Reports tab confidently told a user INTC — a major
 * US-listed, SEC-registered company — has no SEC filings, "as expected for
 * symbols that aren't US-listed or SEC-registered"). That's not possible
 * for INTC to be true, which means the *real* failure was something else
 * entirely — most likely the ticker-map or submissions fetch failing
 * (network hiccup, SEC rate-limiting, a bad User-Agent) — but the old
 * `Promise<CompanyFilings | null>` return type collapsed every failure
 * mode into the same `null`, and the API route/UI then confidently
 * reported the ONE specific, mostly-wrong explanation ("not registered")
 * for all of them. This result type keeps them distinct so the UI can
 * finally tell a real "SEC has never heard of this ticker" (true for,
 * say, most non-US small-caps) apart from "we couldn't reach SEC EDGAR
 * just now" (true for network blips, and honestly the more likely
 * explanation for any well-known US ticker showing up empty).
 */
export type FilingsResult =
  | { status: "ok"; cik: number; companyName: string; filings: FilingRecord[] }
  | { status: "not-registered" }
  | { status: "unavailable" };

/**
 * Recent 10-K/10-Q (or 20-F/6-K for foreign private issuers) filings for a
 * symbol, newest first.
 */
export async function fetchRecentFilings(symbol: string, limit = 12): Promise<FilingsResult> {
  const map = await getTickerMap();
  if (!map) return { status: "unavailable" };

  const match = map.get(bareSymbol(symbol));
  if (!match) return { status: "not-registered" };

  const cikPadded = String(match.cik).padStart(10, "0");
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { status: "unavailable" };
    const data = await res.json();

    const recent = data?.filings?.recent;
    if (!recent?.form) return { status: "unavailable" };

    const filings: FilingRecord[] = [];
    for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
      const form = String(recent.form[i]);
      if (!REPORT_FORM_TYPES.has(form)) continue;

      const accessionNumber = String(recent.accessionNumber[i]);
      const primaryDocument = String(recent.primaryDocument[i] ?? "");
      const accessionNoDashes = accessionNumber.replace(/-/g, "");

      filings.push({
        form,
        filingDate: String(recent.filingDate[i]),
        reportDate: recent.reportDate?.[i] ? String(recent.reportDate[i]) : null,
        description: recent.primaryDocDescription?.[i] ? String(recent.primaryDocDescription[i]) : null,
        accessionNumber,
        url: `https://www.sec.gov/Archives/edgar/data/${match.cik}/${accessionNoDashes}/${primaryDocument}`,
      });
    }

    // A real CIK with zero matching report-type filings on record is
    // genuinely rare but not impossible (a brand-new registrant) — "ok"
    // with an empty array is still the honest status here, since we DID
    // successfully identify and query the company; it's not a lookup or
    // network failure.
    return { status: "ok", cik: match.cik, companyName: match.name, filings };
  } catch {
    return { status: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// XBRL company facts — deep (often 10-20 year) audited historical financial
// statements, straight from each filer's own 10-K/20-F XBRL tagging. This is
// the "multi-source aggregation" architecture's primary deep-history source
// (see lib/finance/aggregate.ts): Yahoo Finance's fundamentalsTimeSeries
// typically only returns ~5-11 years even when explicitly asked for more
// (Yahoo's own backend limit, not something this app controls), so for any
// SEC-registered filer, real 10-year-and-deeper history has to come from
// here instead. Genuinely free and keyless, same as fetchRecentFilings above.
//
// IMPORTANT — same "unverified live" caveat as the rest of this file: this
// sandbox blocks outbound access to data.sec.gov, so the XBRL tag names
// below (standard `us-gaap` taxonomy concepts) could not be validated
// against a real payload during development. They're the well-documented
// canonical tags for each line item, with fallback aliases for the several
// tags companies commonly switch between (e.g. `SalesRevenueNet` before the
// 2018 revenue-recognition standard update vs.
// `RevenueFromContractWithCustomerExcludingAssessedTax` after) — spot-check
// against a couple of real filers (a `10-K` filer and a `20-F` foreign
// private issuer like TEVA) before trusting this in production.
// ---------------------------------------------------------------------------

interface XbrlFactEntry {
  /** Period start (duration concepts only — income statement, cash flow). Absent for instant concepts (balance sheet). */
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}

interface XbrlConceptFacts {
  units: Record<string, XbrlFactEntry[]>;
}

interface XbrlCompanyFacts {
  facts?: {
    "us-gaap"?: Record<string, XbrlConceptFacts>;
  };
}

/** Annual report forms whose facts we trust as a fiscal year's "as-filed" figure. Includes 20-F for foreign private issuers (e.g. TEVA). */
const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A"]);
/** Quarterly report forms. Foreign private issuers (20-F filers) generally
 *  don't file 10-Qs, so quarterly history is effectively US-filer-only. */
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A"]);

/**
 * Reduces one or more candidate XBRL tags (checked in priority order, since
 * companies occasionally switch which tag they file a concept under across
 * years) down to a single period-key -> value map. `classify` decides which
 * entries count as "this kind of period" and what key to file them under —
 * shared by annualSeries (fiscal year, e.g. "2023") and quarterlySeries
 * (fiscal year + quarter, e.g. "2023-Q2") below, since both need identical
 * priority/restatement-recency handling, just different period filters.
 */
function periodSeries(
  facts: Record<string, XbrlConceptFacts> | undefined,
  tags: string[],
  classify: (entry: XbrlFactEntry) => string | null,
  unitKey = "USD"
): Map<string, number> {
  const chosen = new Map<string, { value: number; filed: string; tag: string }>();
  for (const tag of tags) {
    const entries = facts?.[tag]?.units[unitKey];
    if (!entries) continue;
    for (const entry of entries) {
      const key = classify(entry);
      if (key == null) continue;
      const existing = chosen.get(key);
      // Prefer the higher-priority tag for a given period; within the same
      // tag, prefer the most recently filed value (a later /A restatement
      // supersedes the original as-filed figure).
      if (!existing || (existing.tag === tag && entry.filed > existing.filed)) {
        chosen.set(key, { value: entry.val, filed: entry.filed, tag });
      }
    }
  }
  return new Map([...chosen].map(([key, v]) => [key, v.value]));
}

/** Duration in days between an XBRL fact's start/end — used to sanity-check
 *  that a "duration" concept (income statement, cash flow) actually spans
 *  the period it claims to, since the same tag also carries quarterly and
 *  multi-year-cumulative entries that would otherwise corrupt a series. */
function durationDays(entry: XbrlFactEntry): number | null {
  if (!entry.start) return null;
  return (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 86_400_000;
}

/** Genuinely annual, as-filed 10-K/20-F entries only, keyed by fiscal year (e.g. "2023"). */
function annualSeries(
  facts: Record<string, XbrlConceptFacts> | undefined,
  tags: string[],
  unitKey = "USD"
): Map<string, number> {
  return periodSeries(
    facts,
    tags,
    (entry) => {
      if (entry.fp !== "FY" || !ANNUAL_FORMS.has(entry.form)) return null;
      const days = durationDays(entry);
      if (days != null && (days < 300 || days > 400)) return null; // not a genuine ~1-year duration
      return String(entry.fy ?? new Date(entry.end).getFullYear());
    },
    unitKey
  );
}

/** Genuinely quarterly, as-filed 10-Q entries only, keyed "fiscalYear-Qn" (e.g. "2023-Q2"). String-sortable within and across years (see aggregate.ts). */
function quarterlySeries(
  facts: Record<string, XbrlConceptFacts> | undefined,
  tags: string[],
  unitKey = "USD"
): Map<string, number> {
  return periodSeries(
    facts,
    tags,
    (entry) => {
      if (!entry.fp || !/^Q[1-4]$/.test(entry.fp) || !QUARTERLY_FORMS.has(entry.form)) return null;
      const days = durationDays(entry);
      if (days != null && (days < 70 || days > 100)) return null; // not a genuine ~1-quarter duration
      const year = entry.fy ?? new Date(entry.end).getFullYear();
      return `${year}-${entry.fp}`;
    },
    unitKey
  );
}

type SeriesFn = (facts: Record<string, XbrlConceptFacts> | undefined, tags: string[], unitKey?: string) => Map<string, number>;

/**
 * Builds either the annual or quarterly Income Statement series, depending
 * on which `series` function (annualSeries/quarterlySeries) is passed —
 * same tag list and merge logic either way, just a different period filter.
 */
function toSecIncomeRows(facts: Record<string, XbrlConceptFacts> | undefined, series: SeriesFn): IncomeStatementYear[] {
  const revenue = series(facts, [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ]);
  const grossProfit = series(facts, ["GrossProfit"]);
  const operatingIncome = series(facts, ["OperatingIncomeLoss"]);
  const netIncome = series(facts, ["NetIncomeLoss", "ProfitLoss"]);
  const eps = series(facts, ["EarningsPerShareDiluted"], "USD/shares");
  const shares = series(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares");
  const dividends = series(
    facts,
    ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
    "USD/shares"
  );

  const periods = new Set([...revenue.keys(), ...netIncome.keys()]);
  const rows: IncomeStatementYear[] = [];
  for (const fiscalYear of periods) {
    const totalRevenue = revenue.get(fiscalYear);
    const netIncomeVal = netIncome.get(fiscalYear);
    // Require at least revenue or net income to exist — a period with
    // neither isn't a real data point, just noise from a stray tag.
    if (totalRevenue == null && netIncomeVal == null) continue;
    rows.push({
      fiscalYear,
      totalRevenue: totalRevenue ?? 0,
      grossProfit: grossProfit.get(fiscalYear) ?? 0,
      operatingIncome: operatingIncome.get(fiscalYear) ?? 0,
      netIncome: netIncomeVal ?? 0,
      eps: eps.get(fiscalYear) ?? 0,
      sharesOutstandingDiluted: shares.get(fiscalYear) ?? 0,
      dividendsPerShare: dividends.get(fiscalYear) ?? 0,
      dataSource: "sec-edgar",
    });
  }
  return rows.sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear));
}

function toSecBalanceRows(facts: Record<string, XbrlConceptFacts> | undefined, series: SeriesFn): BalanceSheetYear[] {
  const totalAssets = series(facts, ["Assets"]);
  const totalLiabilities = series(facts, ["Liabilities"]);
  const equity = series(facts, [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ]);
  const currentAssets = series(facts, ["AssetsCurrent"]);
  const currentLiabilities = series(facts, ["LiabilitiesCurrent"]);
  const cash = series(facts, [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ]);
  const shortTermInvestments = series(facts, ["ShortTermInvestments", "MarketableSecuritiesCurrent"]);
  const longTermDebt = series(facts, ["LongTermDebtNoncurrent", "LongTermDebt"]);
  const currentDebt = series(facts, ["LongTermDebtCurrent", "DebtCurrent"]);
  const combinedDebt = series(facts, ["DebtLongtermAndShorttermCombinedAmount"]);

  const periods = new Set([...totalAssets.keys(), ...totalLiabilities.keys()]);
  const rows: BalanceSheetYear[] = [];
  for (const fiscalYear of periods) {
    const assets = totalAssets.get(fiscalYear);
    const liabilities = totalLiabilities.get(fiscalYear);
    if (assets == null && liabilities == null) continue;
    const cashVal = cash.get(fiscalYear) ?? 0;
    const totalDebt =
      combinedDebt.get(fiscalYear) ?? (longTermDebt.get(fiscalYear) ?? 0) + (currentDebt.get(fiscalYear) ?? 0);
    rows.push({
      fiscalYear,
      cashAndShortTermInvestments: cashVal + (shortTermInvestments.get(fiscalYear) ?? 0),
      totalCurrentAssets: currentAssets.get(fiscalYear) ?? 0,
      totalCurrentLiabilities: currentLiabilities.get(fiscalYear) ?? 0,
      totalAssets: assets ?? 0,
      totalLiabilities: liabilities ?? 0,
      totalStockholdersEquity: equity.get(fiscalYear) ?? 0,
      totalCash: cashVal,
      totalDebt,
      dataSource: "sec-edgar",
    });
  }
  return rows.sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear));
}

function toSecCashFlowRows(facts: Record<string, XbrlConceptFacts> | undefined, series: SeriesFn): CashFlowYear[] {
  const operatingCashFlow = series(facts, [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ]);
  // SEC's convention reports capex as a positive outflow amount; this
  // codebase's established convention (see toCashFlowYears in yahoo.ts)
  // stores it negative, so it's negated below to stay consistent for every
  // consumer (charts, freeCashFlow math) regardless of which source a given
  // period came from.
  const capex = series(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements"]);
  const stockBasedComp = series(facts, ["ShareBasedCompensation"]);
  const netIncome = series(facts, ["NetIncomeLoss", "ProfitLoss"]);

  const periods = new Set([...operatingCashFlow.keys(), ...netIncome.keys()]);
  const rows: CashFlowYear[] = [];
  for (const fiscalYear of periods) {
    const ocf = operatingCashFlow.get(fiscalYear);
    const ni = netIncome.get(fiscalYear);
    if (ocf == null && ni == null) continue;
    const capexNegative = capex.has(fiscalYear) ? -Math.abs(capex.get(fiscalYear)!) : 0;
    rows.push({
      fiscalYear,
      operatingCashFlow: ocf ?? 0,
      freeCashFlow: (ocf ?? 0) + capexNegative,
      stockBasedCompensation: stockBasedComp.get(fiscalYear) ?? 0,
      capitalExpenditures: capexNegative,
      netIncome: ni ?? 0,
      dataSource: "sec-edgar",
    });
  }
  return rows.sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear));
}

export interface SecFinancials {
  status: "ok" | "not-registered" | "unavailable";
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  /** "fiscalYear-Qn" keyed (e.g. "2023-Q2") — see quarterlySeries' doc comment. Empty for foreign private issuers, which generally don't file 10-Qs. */
  incomeQuarterly: IncomeStatementYear[];
  balanceQuarterly: BalanceSheetYear[];
  cashFlowQuarterly: CashFlowYear[];
}

/**
 * Deep historical financial statements (typically 10+ fiscal years for an
 * established filer) from SEC EDGAR's XBRL company-facts API — the primary
 * "true 10-year history" source in the multi-source aggregation pipeline.
 * See lib/finance/aggregate.ts for how this is merged with Yahoo/FMP data.
 */
export async function fetchSecFinancials(symbol: string): Promise<SecFinancials> {
  const empty = { income: [], balance: [], cashFlow: [], incomeQuarterly: [], balanceQuarterly: [], cashFlowQuarterly: [] };
  const map = await getTickerMap();
  if (!map) return { status: "unavailable", ...empty };

  const match = map.get(bareSymbol(symbol));
  if (!match) return { status: "not-registered", ...empty };

  const cikPadded = String(match.cik).padStart(10, "0");
  try {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86_400 }, // annual filings — daily revalidation is plenty
    });
    if (!res.ok) return { status: "unavailable", ...empty };

    const data = (await res.json()) as XbrlCompanyFacts;
    const facts = data.facts?.["us-gaap"];
    if (!facts) return { status: "unavailable", ...empty };

    // Same XBRL payload backs both — no extra network round trip needed for
    // the quarterly (10-Q) series alongside the annual (10-K/20-F) one.
    return {
      status: "ok",
      income: toSecIncomeRows(facts, annualSeries),
      balance: toSecBalanceRows(facts, annualSeries),
      cashFlow: toSecCashFlowRows(facts, annualSeries),
      incomeQuarterly: toSecIncomeRows(facts, quarterlySeries),
      balanceQuarterly: toSecBalanceRows(facts, quarterlySeries),
      cashFlowQuarterly: toSecCashFlowRows(facts, quarterlySeries),
    };
  } catch {
    return { status: "unavailable", ...empty };
  }
}
