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
 * CONFIRMED against SEC's official Developer FAQ
 * (sec.gov/about/webmaster-frequently-asked-questions#developers, "Last
 * Reviewed or Updated: Aug. 23, 2024" — fetched directly during this
 * session, not assumed): a declared User-Agent is genuinely required, not
 * a best-practice suggestion. The FAQ states verbatim: "Please declare
 * your user agent in request headers," gives the sample shape "Sample
 * Company Name AdminContact@<sample company domain>.com", and documents
 * the exact failure mode this file guards against — requests without one
 * (or with one that doesn't look like that shape) get an "Undeclared
 * Automated Tool" error/403. There is no SEC-sanctioned shared or
 * anonymous-access default; every application is expected to declare its
 * own. Separately, SEC also enforces a flat 10-requests/second-per-IP rate
 * limit across www.sec.gov / data.sec.gov / efts.sec.gov (unrelated to the
 * UA requirement — no header satisfies it, it's purely a request-rate
 * cap), not a concern for this app's per-page-load request volume.
 *
 * Since there's no way to *not* require a UA and stay within SEC's policy,
 * "robust" here means: (1) ship a default that's shaped exactly like SEC's
 * own sample so it passes the same check a real one would, so the app
 * never hard-fails for lack of local .env setup, while (2) making very
 * clear via the startup warning below that a real SEC_EDGAR_CONTACT is
 * still what SEC is actually asking for, and (3) every fetch in this file
 * has a request timeout (see FETCH_TIMEOUT_MS) and resolves a well-formed
 * "unavailable" status rather than throwing or hanging, so a slow/blocked
 * SEC response degrades to the Yahoo/FMP fallback layers (aggregate.ts)
 * instead of ever blocking the whole fundamentals request.
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

/**
 * QA fix (bug report: "5Y/10Y range still only shows ~3-4 years despite the
 * multi-source pipeline"): root-caused via SEC's own Developer FAQ
 * (sec.gov/os/webmaster-faq#developers) — EDGAR doesn't just want a
 * non-empty User-Agent string, it specifically checks for a *declared*
 * contact in the form "Company Name AdminContact@domain.com" and returns
 * 403 ("Undeclared Automated Tool") for anything that doesn't look like
 * that, including the previous default here
 * ("FinLens/1.0 (contact: set SEC_EDGAR_CONTACT env var)" — no @ sign, no
 * real domain). Every request silently failed with `status: "unavailable"`
 * as a result (fetchSecFinancials never throws — see below), so the app
 * fell all the way through to Yahoo for every single ticker, and Yahoo's
 * fundamentalsTimeSeries endpoint has an undocumented-by-Yahoo but
 * extensively-reported hard backend cap of ~4 annual periods / ~5 quarters
 * *regardless of period1* (confirmed against yfinance's own scraper source
 * and multiple independent reports — this isn't something any period1/
 * lookback-window tuning on our side can work around). That combination —
 * SEC EDGAR silently 403ing + Yahoo's hard 4-year cap — is exactly the "3-4
 * years no matter what I select" symptom, and it was invisible in server
 * logs because neither failure path logged anything.
 *
 * Two changes address this: a properly SEC-shaped default User-Agent
 * (still a placeholder — there is no substitute for setting
 * SEC_EDGAR_CONTACT to a real contact per SEC's request, see
 * .env.local.example) and, in every fetch function below, an actual
 * console.warn on non-ok responses/thrown errors including the status
 * code, so a 403 here shows up in server logs instead of silently
 * degrading to "no SEC data for any ticker" with zero trace.
 */
// Shaped to match SEC's own sample header exactly ("Sample Company Name
// AdminContact@<sample company domain>.com") — a plain name + space +
// email, ordinary-looking TLD (not a reserved/obviously-fake one like
// .invalid, which no longer looks like the sample and is one more way an
// automated check could reasonably flag it). Still a placeholder, not a
// real monitored inbox — see the module doc comment above for why this
// exists (a working built-in default) versus what SEC actually wants (a
// real SEC_EDGAR_CONTACT).
const DEFAULT_USER_AGENT = "FinLens contact@finlens.app";
const USER_AGENT = process.env.SEC_EDGAR_CONTACT || DEFAULT_USER_AGENT;

if (!process.env.SEC_EDGAR_CONTACT) {
  console.warn(
    "[FinLens] SEC_EDGAR_CONTACT is not set — SEC EDGAR requests are using a built-in " +
      `placeholder User-Agent ("${DEFAULT_USER_AGENT}"), shaped like the sample SEC's ` +
      "Developer FAQ documents (\"Company Name AdminContact@domain.com\") so requests " +
      "shouldn't be rejected outright, but it is not a real, monitored contact — which is " +
      "what SEC's policy actually asks every application to declare (see " +
      "sec.gov/about/webmaster-frequently-asked-questions#developers). If SEC EDGAR " +
      "requests still fail (403 \"Undeclared Automated Tool\", or any non-2xx logged below), " +
      "financial history silently falls back to Yahoo Finance, which caps annual data at " +
      "~4 fiscal years no matter what range is selected. Set SEC_EDGAR_CONTACT in .env.local " +
      "to a real 'Your App Name you@yourdomain.com' string to fix this properly."
  );
}

/**
 * Every fetch in this file uses this as an AbortSignal.timeout — without
 * it, a hung or very slow response from SEC (rate-limiting, an outage, a
 * network blip) would leave the underlying fetch() pending indefinitely
 * (Node's fetch has no default timeout), and since this file's exports are
 * awaited inside a Promise.all alongside Yahoo/FMP in getFundamentals()
 * (yahoo.ts), that would block the *entire* fundamentals request — not
 * just degrade SEC's contribution to it. 10s is generous for a JSON API
 * response but still well short of what a user would tolerate waiting on.
 */
const FETCH_TIMEOUT_MS = 10_000;

/** True for both DOMException("AbortError") (browser-shaped) and Node's
 *  undici abort error — used to log a clearer "timed out" message instead
 *  of a generic thrown-error one. */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

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
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          console.warn(
            `[FinLens] SEC EDGAR ticker map fetch failed: HTTP ${res.status} ${res.statusText}. ` +
              (res.status === 403
                ? "This is almost always a rejected/undeclared User-Agent — see SEC_EDGAR_CONTACT in .env.local.example."
                : "Every symbol will fall back to Yahoo-only history until this resolves.")
          );
          return null;
        }
        const raw = (await res.json()) as Record<
          string,
          { cik_str: number; ticker: string; title: string }
        >;
        const map = new Map<string, { cik: number; name: string }>();
        for (const entry of Object.values(raw)) {
          map.set(entry.ticker.toUpperCase(), { cik: entry.cik_str, name: entry.title });
        }
        return map;
      } catch (err) {
        if (isAbortError(err)) {
          console.warn(
            `[FinLens] SEC EDGAR ticker map fetch timed out after ${FETCH_TIMEOUT_MS}ms — falling back to Yahoo-only history for every symbol this request.`
          );
        } else {
          console.warn("[FinLens] SEC EDGAR ticker map fetch threw:", err instanceof Error ? err.message : err);
        }
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[FinLens] SEC EDGAR submissions fetch failed for ${symbol} (CIK ${match.cik}): HTTP ${res.status} ${res.statusText}`);
      return { status: "unavailable" };
    }
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
  } catch (err) {
    if (isAbortError(err)) {
      console.warn(`[FinLens] SEC EDGAR submissions fetch timed out after ${FETCH_TIMEOUT_MS}ms for ${symbol} (CIK ${match.cik}).`);
    } else {
      console.warn(`[FinLens] SEC EDGAR submissions fetch threw for ${symbol}:`, err instanceof Error ? err.message : err);
    }
    return { status: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// XBRL company facts — deep (often 10-20 year) audited historical financial
// statements, straight from each filer's own 10-K/20-F XBRL tagging. This is
// the "multi-source aggregation" architecture's primary — and, in practice,
// *only* — deep-history source (see lib/finance/aggregate.ts): Yahoo
// Finance's fundamentalsTimeSeries has a hard backend cap of roughly 4
// annual periods / 5 quarters *regardless of period1* (confirmed against
// yfinance's own scraper source and multiple independent reports — not
// something any lookback-window tuning on our side can widen), so for any
// SEC-registered filer, real 5/10-year-and-deeper history has to come from
// here instead — this file being unreachable/misconfigured (see the
// USER_AGENT doc comment above) is functionally equivalent to capping every
// range selector above ~4 years at the same ~4 years of data. Genuinely
// free and keyless, same as fetchRecentFilings above.
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

// ---------------------------------------------------------------------------
// Retroactive stock-split adjustment
// ---------------------------------------------------------------------------

export interface StockSplitEvent {
  /** ISO date the split became effective. */
  date: string;
  /** Shares-per-old-share multiplier — 20 for AMZN's June 2022 20-for-1 split, 0.1 for a 1-for-10 reverse split. */
  ratio: number;
}

/**
 * Bug fix (reported: "Amazon's June 2022 20-for-1 split creates an
 * artificial ~11x cliff in the EPS chart" — diluted shares correctly jump
 * ~504M -> ~10.2B between FY2021 and FY2022, but EPS drops from ~$23 to
 * ~$2 with no adjustment, instead of both series reading as a smooth
 * continuation of the same underlying business performance). Root cause:
 * `eps`/`sharesOutstandingDiluted`/`dividendsPerShare` were taken directly
 * from each fiscal year's *as-filed* XBRL facts with no retroactive
 * adjustment — correct for the post-split period, but every pre-split
 * historical period is still denominated in pre-split share counts, so the
 * two halves of the series aren't on the same scale.
 *
 * Detects splits via XBRL's purpose-built `StockholdersEquityNoteStockSplitConversionRatio`
 * concept — deliberately NOT by inferring one from a large jump in
 * reported shares outstanding between periods. That heuristic is a
 * well-known false-positive trap: a large primary share issuance, a
 * follow-on offering, or an all-stock acquisition can produce a
 * similar-looking jump, and misclassifying one as a split would silently
 * corrupt real historical data — worse than the original bug. A ticker
 * without this specific XBRL fact simply gets no adjustment rather than a
 * guessed, possibly-wrong one; unverified live in this sandbox (same
 * network-blocked caveat as the rest of this file), so treat this as the
 * documented, reasoned design rather than something spot-checked against a
 * real payload — confirm the exact tag/unit shape against AMZN's real
 * company-facts response before shipping.
 */
function detectStockSplits(facts: Record<string, XbrlConceptFacts> | undefined): StockSplitEvent[] {
  const entries = facts?.["StockholdersEquityNoteStockSplitConversionRatio"]?.units?.pure ?? [];
  const byDate = new Map<string, { ratio: number; filed: string }>();
  for (const entry of entries) {
    // A ratio of exactly 1 (or anything non-finite/non-positive) isn't a
    // real split — skip rather than apply a no-op/corrupting adjustment.
    if (typeof entry.val !== "number" || !Number.isFinite(entry.val) || entry.val <= 0 || entry.val === 1) continue;
    const existing = byDate.get(entry.end);
    // Same "most recently filed wins" convention as periodSeries above —
    // if multiple filings disclose the same split event, prefer whichever
    // was filed last.
    if (!existing || entry.filed > existing.filed) {
      byDate.set(entry.end, { ratio: entry.val, filed: entry.filed });
    }
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, ratio: v.ratio }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Approximates a fiscal-period label ("2022" or "2022-Q3") as its calendar
 * period-end date, purely for ordering against a split's exact XBRL date —
 * "did this reporting period end before or after the split." A ~1-2 month
 * slack for fiscal years that don't align to the calendar (uncommon among
 * the tickers this app targets) is acceptable here since it only affects
 * which side of a split boundary a period lands on, not any actual
 * financial figure.
 */
function periodEndDateFromLabel(fiscalYear: string): Date {
  const quarterMatch = /^(\d{4})-Q([1-4])$/.exec(fiscalYear);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    return new Date(year, quarter * 3, 0); // last day of that calendar quarter's final month
  }
  const year = Number(fiscalYear);
  return Number.isFinite(year) ? new Date(year, 11, 31) : new Date(0);
}

/** Product of every split's ratio whose effective date falls after `periodEnd` — the multiplier needed to restate that period's share-denominated figures onto today's post-split share count. */
function cumulativeSplitRatioAfter(periodEnd: Date, splits: StockSplitEvent[]): number {
  let ratio = 1;
  for (const split of splits) {
    if (new Date(split.date).getTime() > periodEnd.getTime()) ratio *= split.ratio;
  }
  return ratio;
}

/**
 * Builds either the annual or quarterly Income Statement series, depending
 * on which `series` function (annualSeries/quarterlySeries) is passed —
 * same tag list and merge logic either way, just a different period filter.
 *
 * Bug fix (reported: "Gross Profit shows as 0/flat for Google/Alphabet
 * while Total Revenues and Operating Income populate correctly"): root
 * cause confirmed by re-reading how XBRL tagging actually works — unlike
 * Revenues/OperatingIncomeLoss/NetIncomeLoss (all real line items on
 * essentially every filer's income statement, so essentially every filer
 * tags them), "Gross Profit" is only tagged by companies whose income
 * statement actually presents a Gross Profit subtotal line. Alphabet's
 * (like many tech/services companies') income statement is single-step —
 * Revenues, then "Costs and expenses" broken into Cost of revenues / R&D /
 * SG&A, then "Income from operations" — with no Gross Profit line at all,
 * so `GrossProfit` is never instance-tagged in their XBRL, ever, for any
 * year. The old code had no fallback for this: `grossProfit.get(fiscalYear)
 * ?? 0` silently turned "this filer doesn't tag this concept" into a
 * permanent, misleading zero on every chart.
 *
 * This is a single-tag problem with an outsized effect, too: because
 * mergeYearsBySource (aggregate.ts) picks one source's *entire* row for a
 * given fiscal year rather than blending fields across sources, a filer
 * like this having Revenue/OperatingIncome/NetIncome tagged (so SEC EDGAR
 * "wins" that year against Yahoo/FMP) means its flat-zero Gross Profit
 * wins right along with it — Yahoo's data for that same year is never
 * consulted to patch just that one field, even if Yahoo happens to have a
 * usable number.
 *
 * Fix: derive Gross Profit = Revenue - Cost of Revenue whenever the direct
 * `GrossProfit` tag is missing for a specific period (checked per-period,
 * not just "does this filer ever tag it," since some filers change their
 * statement presentation across years). Applied the identical fallback
 * pattern one level up for Operating Income (via `CostsAndExpenses`) for
 * the rarer filer that doesn't even tag that subtotal, per the same
 * "comprehensive fallbacks so no core chart silently zeroes out" goal.
 */
function toSecIncomeRows(
  facts: Record<string, XbrlConceptFacts> | undefined,
  series: SeriesFn,
  splits: StockSplitEvent[] = []
): IncomeStatementYear[] {
  const revenue = series(facts, [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
    "RevenuesNetOfInterestExpense",
  ]);
  const grossProfitTagged = series(facts, ["GrossProfit"]);
  // Fallback derivation source for filers that never tag GrossProfit at
  // all (see doc comment above) — checked in priority order, since a
  // filer's chosen "cost" tag can vary by industry (goods vs. services vs.
  // a blended cost-of-revenue line).
  const costOfRevenue = series(facts, [
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
    "CostOfServices",
    "CostOfGoodsSoldExcludingDepreciationDepletionAndAmortization",
  ]);
  const operatingIncomeTagged = series(facts, ["OperatingIncomeLoss"]);
  // Fallback derivation source for the rarer filer that doesn't tag an
  // operating-income subtotal either — same rationale as Gross Profit.
  const costsAndExpenses = series(facts, ["CostsAndExpenses"]);
  const netIncome = series(facts, ["NetIncomeLoss", "ProfitLoss"]);
  const eps = series(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], "USD/shares");
  const shares = series(
    facts,
    [
      "WeightedAverageNumberOfDilutedSharesOutstanding",
      "WeightedAverageNumberOfDilutedAndBasicSharesOutstanding",
      "WeightedAverageNumberOfSharesOutstandingBasic",
    ],
    "shares"
  );
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

    const grossProfitVal =
      grossProfitTagged.get(fiscalYear) ??
      (totalRevenue != null && costOfRevenue.has(fiscalYear)
        ? totalRevenue - costOfRevenue.get(fiscalYear)!
        : undefined);
    const operatingIncomeVal =
      operatingIncomeTagged.get(fiscalYear) ??
      (totalRevenue != null && costsAndExpenses.has(fiscalYear)
        ? totalRevenue - costsAndExpenses.get(fiscalYear)!
        : undefined);

    // Retroactive split adjustment (see detectStockSplits doc comment):
    // ratio is 1 for any period that's already post-every-split, so this
    // is a no-op everywhere except genuinely pre-split historical periods.
    const splitRatio = splits.length > 0 ? cumulativeSplitRatioAfter(periodEndDateFromLabel(fiscalYear), splits) : 1;

    rows.push({
      fiscalYear,
      totalRevenue: totalRevenue ?? 0,
      grossProfit: grossProfitVal ?? 0,
      operatingIncome: operatingIncomeVal ?? 0,
      netIncome: netIncomeVal ?? 0,
      // Per-share figures scale with shares outstanding — multiply share
      // counts and divide per-share dollar amounts by the same cumulative
      // ratio, so a pre-split period reads as if the split had always been
      // in effect (matching how every post-split period is already
      // reported) instead of creating an artificial cliff at the split
      // date.
      eps: (eps.get(fiscalYear) ?? 0) / splitRatio,
      sharesOutstandingDiluted: (shares.get(fiscalYear) ?? 0) * splitRatio,
      dividendsPerShare: (dividends.get(fiscalYear) ?? 0) / splitRatio,
      dataSource: "sec-edgar",
    });
  }
  return rows.sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear));
}

/**
 * Note on the one gap here that isn't fixable with a tag fallback:
 * `AssetsCurrent`/`LiabilitiesCurrent` (current assets/liabilities) are
 * genuinely absent from the XBRL of filers that don't present a classified
 * balance sheet at all — banks and other financial institutions, by
 * standard industry convention, don't split assets/liabilities into
 * current/noncurrent (a bank's balance sheet is ordered by liquidity
 * instead). There is no alternate us-gaap tag that means the same thing
 * for those filers; the 0 those fields fall back to for such a company
 * reflects a genuine absence in the underlying filing, not a mapping bug.
 * Every other field below has real fallback tag variants.
 */
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
  const capex = series(facts, [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsForCapitalImprovements",
    "PaymentsToAcquireProductiveAssets",
  ]);
  // "ShareBasedCompensation" is the common tag, but a number of large
  // filers (several under the same "big tech" umbrella as the Gross Profit
  // fix above) file this concept under "AllocatedShareBasedCompensationExpense" instead.
  const stockBasedComp = series(facts, ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"]);
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
// Historical-depth note (checked against an iCharts-vs-FinLens audit that
// flagged FinLens' SEC-sourced history for a filer stopping around 2009 vs.
// iCharts reaching back to 1997): this file has no hardcoded start-year
// cutoff anywhere — periodEndDateFromLabel/annualSeries/quarterlySeries all
// walk whatever fiscal years exist in the companyfacts payload with no
// floor. The ~2009 wall is a property of the *source data*, not this
// integration: SEC's structured-XBRL mandate only took effect for large
// accelerated filers' fiscal periods ending after June 15, 2009 (phased in
// for smaller filers afterward), and the companyfacts API is built
// entirely from structured XBRL — so data.sec.gov genuinely has nothing
// machine-readable before that for almost any filer, regardless of how far
// back its actual 10-K filings go. A pre-2009 chart (like iCharts showing
// 1997) has to come from a different source (e.g. a vendor that hand-parses
// older plain-text/HTML filings) — there's no additional EDGAR request
// shape or tag that unlocks it here.
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      // This is the single most important line in this file for diagnosing
      // "why is history only ~4 years" reports — a non-ok response here
      // means the deep-history layer contributed zero rows and everything
      // downstream silently fell back to Yahoo's ~4-year-capped data. See
      // the USER_AGENT doc comment above for the likely cause of a 403.
      console.warn(
        `[FinLens] SEC EDGAR company-facts fetch failed for ${symbol} (CIK ${match.cik}): ` +
          `HTTP ${res.status} ${res.statusText}. Falling back to Yahoo/FMP for this ticker's ` +
          `history (Yahoo alone typically caps out around 4 fiscal years).`
      );
      return { status: "unavailable", ...empty };
    }

    const data = (await res.json()) as XbrlCompanyFacts;
    const facts = data.facts?.["us-gaap"];
    if (!facts) {
      console.warn(`[FinLens] SEC EDGAR company-facts response for ${symbol} (CIK ${match.cik}) had no us-gaap facts.`);
      return { status: "unavailable", ...empty };
    }

    // Same XBRL payload backs both — no extra network round trip needed for
    // the quarterly (10-Q) series alongside the annual (10-K/20-F) one.
    //
    // Stock splits apply once, from the full facts payload, and get threaded
    // into both the annual and quarterly income builders below so a split
    // that lands mid-year still retroactively adjusts every prior quarter
    // and fiscal year's per-share figures consistently.
    const splits = detectStockSplits(facts);
    const result: SecFinancials = {
      status: "ok",
      income: toSecIncomeRows(facts, annualSeries, splits),
      balance: toSecBalanceRows(facts, annualSeries),
      cashFlow: toSecCashFlowRows(facts, annualSeries),
      incomeQuarterly: toSecIncomeRows(facts, quarterlySeries, splits),
      balanceQuarterly: toSecBalanceRows(facts, quarterlySeries),
      cashFlowQuarterly: toSecCashFlowRows(facts, quarterlySeries),
    };
    // A 200 response with zero extracted rows is a different failure mode
    // than a 403 (the tag lists in toSecIncomeRows/etc. not matching this
    // filer's chosen XBRL tags) — worth its own log line since it wouldn't
    // otherwise be distinguishable from "SEC EDGAR is fine, this ticker
    // just doesn't have annual data" from the outside.
    if (result.income.length === 0 && result.balance.length === 0 && result.cashFlow.length === 0) {
      console.warn(
        `[FinLens] SEC EDGAR company-facts for ${symbol} (CIK ${match.cik}) fetched OK but yielded ` +
          `0 fiscal years — likely an XBRL tag mismatch (see toSecIncomeRows/toSecBalanceRows tag lists).`
      );
    }
    return result;
  } catch (err) {
    if (isAbortError(err)) {
      console.warn(
        `[FinLens] SEC EDGAR company-facts fetch timed out after ${FETCH_TIMEOUT_MS}ms for ${symbol} (CIK ${match.cik}) — falling back to Yahoo/FMP for this ticker's history.`
      );
    } else {
      console.warn(`[FinLens] SEC EDGAR company-facts fetch threw for ${symbol}:`, err instanceof Error ? err.message : err);
    }
    return { status: "unavailable", ...empty };
  }
}
