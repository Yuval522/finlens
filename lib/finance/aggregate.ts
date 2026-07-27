/**
 * Multi-source aggregation for historical financial statements.
 *
 * Rather than trusting a single provider for a fiscal year's income
 * statement / balance sheet / cash flow row, getFundamentals() (yahoo.ts)
 * fetches from up to three sources in parallel and this file merges them
 * whole-row-per-fiscal-year (never blending individual fields from
 * different sources within the same year — that risks mixing incompatible
 * line-item definitions) in a fixed priority order:
 *
 *   1. SEC EDGAR (sec-edgar.ts)  — audited XBRL data straight from 10-K/20-F
 *      filings, typically 10+ years deep for any SEC-registered filer.
 *      This is what makes a genuine "10 Years" / "All Available" range
 *      selection actually mean something, instead of being capped by
 *      whatever a single quote-data API happens to return.
 *   2. Yahoo Finance (yahoo.ts)  — recent years, and the *only* source for
 *      tickers SEC doesn't register (foreign-only listings with no US ADR).
 *   3. Financial Modeling Prep (providers/fmp.ts) — opt-in (needs
 *      FMP_API_KEY), last-resort fallback for whatever gap remains; its
 *      free tier caps history at ~5 years so it rarely adds depth beyond
 *      what Yahoo already covers, but occasionally fills an isolated
 *      missing year within that recent window.
 *
 * Every merged row keeps a `dataSource` tag so the UI can show exactly
 * where each year's numbers came from (see summarizeYearSources /
 * formatSourceSummary, used by the Income/Balance/Cash Flow panel badges).
 */

import type { FinancialDataSource } from "./types";

export interface YearRow {
  fiscalYear: string;
  dataSource?: FinancialDataSource;
}

export interface SourceLayer<T extends YearRow> {
  source: FinancialDataSource;
  years: T[];
}

/**
 * Merges ordered source layers into one fiscal-year timeline. For each
 * fiscal year, the first layer (in priority order) that has a row wins —
 * later layers only fill years earlier ones are missing entirely, so a
 * single year's figures always come from one consistent, real filing/API
 * response rather than a patchwork of fields from different providers.
 */
export function mergeYearsBySource<T extends YearRow>(
  label: string,
  symbol: string,
  layers: SourceLayer<T>[]
): T[] {
  const byYear = new Map<string, T>();
  for (const layer of layers) {
    for (const row of layer.years) {
      if (!byYear.has(row.fiscalYear)) {
        byYear.set(row.fiscalYear, { ...row, dataSource: layer.source });
      }
    }
  }
  // String comparison, not Number() subtraction — `fiscalYear` is either a
  // bare year ("2023") or a quarter label ("2023-Q2", see quarterLabel() /
  // quarterlySeries()), and Number("2023-Q2") is NaN. Plain lexicographic
  // comparison sorts both correctly: same-length year strings compare in
  // numeric order, and "YYYY-Qn" keys compare correctly too since the year
  // prefix dominates and Q1 < Q2 < Q3 < Q4 as characters.
  const merged = [...byYear.values()].sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear));
  logSourceBreakdown(label, symbol, merged);
  warnIfYearsLookStale(label, symbol, merged);
  warnIfDuplicateValuesAcrossYears(label, symbol, merged);
  return merged;
}

export interface SourceRun {
  source: FinancialDataSource;
  from: string;
  to: string;
}

/**
 * Collapses a merged, chronologically-sorted row list into contiguous
 * same-source runs (e.g. rows tagged sec-edgar for 2016-2023 then yahoo for
 * 2024-2026 become two runs) — shared by both the dev-log line below and
 * the UI attribution badge (see IncomeStatementPanel.tsx etc.) so the two
 * never drift out of sync with each other.
 */
export function summarizeYearSources<T extends YearRow>(rows: T[]): SourceRun[] {
  const runs: SourceRun[] = [];
  for (const row of rows) {
    if (!row.dataSource) continue; // untagged (mock/demo data) — nothing to attribute
    const last = runs[runs.length - 1];
    if (last && last.source === row.dataSource) {
      last.to = row.fiscalYear;
    } else {
      runs.push({ source: row.dataSource, from: row.fiscalYear, to: row.fiscalYear });
    }
  }
  return runs;
}

export const SOURCE_LABELS: Record<FinancialDataSource, string> = {
  "sec-edgar": "SEC EDGAR",
  yahoo: "Yahoo Finance",
  fmp: "Financial Modeling Prep",
};

/** Human-readable one-liner, e.g. "2016-2023: SEC EDGAR · 2024-2026: Yahoo Finance". */
export function formatSourceSummary(runs: SourceRun[]): string {
  return runs
    .map((r) => `${r.from === r.to ? r.from : `${r.from}–${r.to}`}: ${SOURCE_LABELS[r.source]}`)
    .join(" · ");
}

/**
 * Deliberately always-on (not gated behind NODE_ENV like this codebase's
 * other dev-only diagnostics, e.g. warnIfFiscalYearGaps in yahoo.ts) —
 * source attribution is a requested transparency feature, not noise to
 * silence in production, and it's one line per statement fetch rather than
 * per-row spam.
 */
function logSourceBreakdown<T extends YearRow>(label: string, symbol: string, rows: T[]): void {
  if (rows.length === 0) {
    console.info(`[FinLens] ${label}(${symbol}): no data from any source`);
    return;
  }
  const summary = formatSourceSummary(summarizeYearSources(rows));
  console.info(`[FinLens] ${label}(${symbol}): ${rows.length} year(s) — ${summary}`);
}

/**
 * Cross-check added after an external audit report claimed a systemic
 * "+2 year" fiscal-label shift across every ticker (e.g. GOOGL's real
 * FY2021 revenue allegedly showing up labeled "2023"). Investigated and
 * NOT reproduced against this codebase: every fiscal-year string in this
 * pipeline is read directly from the row's own actual reported period —
 * annualLabel()/quarterLabel() in yahoo.ts pull `date.getFullYear()` off
 * the real Date each fundamentalsTimeSeries row carries, and
 * annualSeries()/quarterlySeries() in providers/sec-edgar.ts key off each
 * XBRL fact's own `fy` field (falling back to its `end` date) — there is
 * no "currentYear - N" anchor-arithmetic anywhere in this file or those
 * two, which is what the report's root-cause hypothesis would require.
 * Cross-referencing the report's own worked AAPL example against this
 * repo's mock-data.ts (the one payload fully inspectable here) also
 * contradicts it: "2023" already holds Apple's real FY2023 revenue
 * ($383.285B), not FY2025's.
 *
 * Kept as a standing safeguard regardless — a genuinely stale/misconfigured
 * deployment (e.g. SEC_EDGAR_CONTACT unset *and* Yahoo rate-limited) could
 * still produce the surface symptom the report described: real, correctly
 * labeled, but old data silently presented as current. A gap this large is
 * worth surfacing loudly during development rather than only being caught
 * by an ad hoc diff against a live provider payload. Dev-only, like the
 * neighboring warnIfFiscalYearGaps() in yahoo.ts — this is a diagnostic
 * for catching data-freshness regressions during development, not a
 * user-facing signal.
 */
function warnIfYearsLookStale<T extends YearRow>(label: string, symbol: string, rows: T[]): void {
  if (process.env.NODE_ENV === "production") return;
  // Bare year strings only ("2023") — quarterly ("2023-Q2") and trailing
  // ("TTM"/"MRQ") labels correctly fall out of Number.isFinite here, same
  // filter convention as warnIfFiscalYearGaps in yahoo.ts.
  const numericYears = rows.map((r) => Number(r.fiscalYear)).filter((y) => Number.isFinite(y));
  if (numericYears.length === 0) return;
  const newest = Math.max(...numericYears);
  const currentYear = new Date().getFullYear();
  // A filer's most recent annual filing can legitimately lag the current
  // calendar year by close to a year (e.g. a December-FY filer's 10-K for
  // last year isn't on file until well into Q1/Q2 of this one) — 2+ years
  // behind is the specific signature the external audit described, so
  // that's the threshold flagged here rather than anything tighter.
  if (currentYear - newest >= 2) {
    console.warn(
      `[FinLens] ${label}(${symbol}): newest fiscal year label is ${newest}, ` +
        `${currentYear - newest} years behind the current calendar year (${currentYear}). ` +
        `Could be a genuinely slow/incomplete data source, or a labeling bug — verify ` +
        `against a raw provider payload (SEC EDGAR's companyfacts API, or Yahoo's ` +
        `fundamentalsTimeSeries) before trusting it.`
    );
  }
}

/**
 * Dev-only fingerprint check added after a user-reported bug (NVDA's
 * fullscreen Total Revenues chart showing "2026" = $61B, independently
 * verified via web search to be wrong — NVIDIA's real FY2026 revenue was
 * $215.9B, while $61B numerically matches NVIDIA's real FY2024 revenue of
 * $60.922B almost exactly). The exact upstream root cause couldn't be
 * pinned down without live network access to Yahoo/SEC EDGAR in this
 * environment, and per this file's standing principle, guessing at a "fix"
 * risks silently corrupting otherwise-correct data — worse than the
 * original bug. This instead detects the specific fingerprint a
 * label/merge collision of this kind would leave behind: two DIFFERENT,
 * adjacent fiscal-year rows carrying the same (or near-identical) value
 * for the same large-magnitude metric. Real companies essentially never
 * report an unchanged dollar figure for revenue/income two years running,
 * so a match here is far more likely to mean one row's fiscal-year label
 * is wrong than a genuine flat year.
 */
function warnIfDuplicateValuesAcrossYears<T extends YearRow>(label: string, symbol: string, rows: T[]): void {
  if (process.env.NODE_ENV === "production") return;
  if (rows.length < 2) return;
  // Compare only adjacent rows in the sorted timeline — a same-value
  // collision between neighboring years is the specific signature of a
  // labeling/merge bug; comparing every pair against every other pair
  // would also flag distant, coincidentally-similar years far more often
  // (e.g. a slow-growth company's revenue five years apart).
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.fiscalYear === cur.fiscalYear) continue;
    for (const key of Object.keys(cur) as (keyof T)[]) {
      if (key === "fiscalYear" || key === "dataSource") continue;
      const a = prev[key];
      const b = cur[key];
      if (typeof a !== "number" || typeof b !== "number") continue;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      // Ignore sub-$1M values — many statement fields legitimately sit at
      // (or near) zero across multiple years, e.g. a debt-free company's
      // totalDebt. Only large-magnitude duplicates are statistically
      // implausible enough by chance to be worth flagging.
      if (Math.abs(a) < 1_000_000) continue;
      const relDiff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
      if (relDiff < 0.001) {
        console.warn(
          `[FinLens] ${label}(${symbol}): "${String(key)}" is nearly identical in ` +
            `${prev.fiscalYear} (${a.toLocaleString("en-US")}) and ${cur.fiscalYear} ` +
            `(${b.toLocaleString("en-US")}) — possible fiscal-year label/merge collision ` +
            `rather than a genuine flat year-over-year figure. Verify against a raw ` +
            `provider payload before trusting either row.`
        );
      }
    }
  }
}
