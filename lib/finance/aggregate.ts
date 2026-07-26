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
  const merged = [...byYear.values()].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
  logSourceBreakdown(label, symbol, merged);
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
