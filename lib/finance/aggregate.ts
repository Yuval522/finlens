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
 *
 * Data triangulation: priority order is the default tie-breaker, but
 * mergeYearsBySource's optional `anchorField` lets it actually cross-check
 * providers against each other for years all three cover, and demote a
 * clear 2-against-1 outlier instead of trusting priority blindly — see
 * that function's doc comment for the exact mechanism and thresholds.
 *
 * Discrepancy flagging: separately from the 2-against-1 demotion above
 * (which needs 3 sources to know which one is likely wrong), ANY period
 * where 2+ sources disagree beyond tolerance on `anchorField` gets a
 * `dataDiscrepancy: true` tag on the merged row — this is deliberately
 * "flag, don't guess": with only 2 disagreeing sources there's no
 * majority to trust, so rather than silently picking the priority winner
 * and saying nothing, the row carries a visible signal (rendered by
 * SourceAttributionBadge) that this period's figures haven't been
 * corroborated yet. The most common real-world trigger is exactly the
 * freshness case this exists for: a just-released quarter where one
 * provider has already indexed the new numbers and another hasn't caught
 * up, so their same-labeled period genuinely differs.
 */

import type { FinancialDataSource } from "./types";

export interface YearRow {
  fiscalYear: string;
  dataSource?: FinancialDataSource;
  /** See the doc comment on this same field in types.ts (IncomeStatementYear et al.) for the full mechanism. */
  dataDiscrepancy?: boolean;
}

export interface SourceLayer<T extends YearRow> {
  source: FinancialDataSource;
  years: T[];
}

/** Relative difference between two finite numbers, symmetric and 0..~2 scale (not clamped). */
function relativeDifference(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}

// Cross-source triangulation thresholds — see mergeYearsBySource's
// `anchorField` doc comment. AGREEMENT: how close two independent sources
// must be to count as "corroborating" each other (loose enough to absorb
// normal rounding/restatement noise between two real providers).
// OUTLIER: how far the priority winner must diverge from BOTH corroborating
// sources before it's treated as the odd one out rather than a genuine,
// if-slightly-different, real figure. Deliberately wide apart (2% vs 8%) so
// this only fires on clear-cut cases, not routine provider-to-provider
// variance.
const CROSS_VALIDATION_AGREEMENT_TOLERANCE = 0.02;
const CROSS_VALIDATION_OUTLIER_TOLERANCE = 0.08;
/** Same floor as warnIfDuplicateValuesAcrossYears — sub-$1M anchor values are too close to
 *  noise/rounding for a percentage comparison to mean anything. */
const CROSS_VALIDATION_MIN_MAGNITUDE = 1_000_000;

/**
 * Merges ordered source layers into one fiscal-year timeline. For each
 * fiscal year, the first layer (in priority order) that has a row wins —
 * later layers only fill years earlier ones are missing entirely, so a
 * single year's figures always come from one consistent, real filing/API
 * response rather than a patchwork of fields from different providers.
 *
 * Data-triangulation override (the `anchorField` option): every layer is
 * fetched in parallel regardless of who ultimately wins (see
 * getFundamentals() in yahoo.ts), so for any fiscal year where 3 sources
 * all report data, this function can — and now does — actually compare
 * them instead of blindly trusting priority order. If the two
 * lower-priority sources agree closely with each other on `anchorField`
 * (e.g. totalRevenue for income, totalAssets for balance,
 * operatingCashFlow for cash flow) but the would-be winner diverges
 * sharply from BOTH of them, that's a 2-against-1 majority against the
 * "winner" — a real signal, not routine provider noise — so the row is
 * demoted to the next-best (whole-row, still un-blended — see this file's
 * module doc comment) source instead. This only ever activates with 3
 * genuinely present sources for the same year (rare when FMP is
 * unconfigured, by design — see CROSS_VALIDATION_* thresholds), and when
 * it doesn't activate, behavior is byte-for-byte identical to the
 * original priority-order merge. Omitting `anchorField` entirely (existing
 * call sites that haven't opted in) preserves the original behavior
 * exactly.
 *
 * Zero-field backfill (the `backfillZeroFields` option): live bug reports
 * against AT&T found `grossProfit`/`operatingIncome` (income) and
 * `totalLiabilities` (balance) coming back as a hard `0` from SEC EDGAR for
 * an operating company with real, positive revenue/assets — not because
 * the value is genuinely zero, but because that filer simply doesn't tag
 * the specific XBRL concept toSecIncomeRows/toSecBalanceRows (sec-edgar.ts)
 * looks for (e.g. a cost-of-revenue tag variant this app doesn't check),
 * so the derivation silently falls back to 0. Because mergeYearsBySource
 * otherwise selects a WHOLE row per year, that fabricated 0 wins outright
 * even when Yahoo/FMP have a real, non-zero number for that one field —
 * their whole row loses priority for the year, so their good data for
 * this field is never consulted either. `backfillZeroFields` closes that
 * specific gap: for a listed field, if the winning row's value is exactly
 * 0, and ANY other source's row for the same year has a real (finite,
 * non-zero) value for that field, that one field gets patched onto a copy
 * of the winning row — every other field, and the row's `dataSource`
 * attribution, stays exactly as the winner reported it. This is
 * deliberately narrower than "blend fields across sources": it only ever
 * fires on a 0 (a value that structurally can't be a differing-but-valid
 * figure, only an absence), never on a genuine disagreement between two
 * real numbers — so it doesn't reopen the "mixing incompatible line-item
 * definitions" risk this file's whole-row design otherwise avoids. Only
 * apply this to fields that are essentially never legitimately exactly
 * zero for a real operating company (Gross Profit, Operating Income,
 * Total Liabilities) — never to a field where 0 can be a genuine, correct
 * value (e.g. Total Debt for a debt-free company, or Stock-Based
 * Compensation for a company with no equity comp program).
 */
export function mergeYearsBySource<T extends YearRow>(
  label: string,
  symbol: string,
  layers: SourceLayer<T>[],
  options?: { anchorField?: keyof T & string; backfillZeroFields?: (keyof T & string)[] }
): T[] {
  const anchorField = options?.anchorField;
  const backfillZeroFields = options?.backfillZeroFields;
  const candidatesByYear = new Map<string, { source: FinancialDataSource; row: T }[]>();
  for (const layer of layers) {
    for (const row of layer.years) {
      const list = candidatesByYear.get(row.fiscalYear) ?? [];
      list.push({ source: layer.source, row });
      candidatesByYear.set(row.fiscalYear, list);
    }
  }

  const byYear = new Map<string, T>();
  for (const [fiscalYear, candidates] of candidatesByYear) {
    let winner = candidates[0]; // highest-priority source that has this year — default/original behavior

    // Discrepancy flag: independent of (and computed before) the 3-source
    // outlier-demotion below — even a plain 2-source disagreement, which
    // isn't enough evidence to know which provider is right, is still
    // worth surfacing rather than silently picking the priority winner and
    // saying nothing. Computed across ALL candidates for this period, not
    // just the eventual winner, so it also catches disagreement between
    // two lower-priority sources the demotion logic never even inspects.
    let dataDiscrepancy = false;
    if (anchorField) {
      const anchorValues = candidates
        .map((c) => Number(c.row[anchorField]))
        .filter((v) => Number.isFinite(v) && Math.abs(v) >= CROSS_VALIDATION_MIN_MAGNITUDE);
      outer: for (let i = 0; i < anchorValues.length; i++) {
        for (let j = i + 1; j < anchorValues.length; j++) {
          if (relativeDifference(anchorValues[i], anchorValues[j]) > CROSS_VALIDATION_OUTLIER_TOLERANCE) {
            dataDiscrepancy = true;
            break outer;
          }
        }
      }
      if (dataDiscrepancy && process.env.NODE_ENV !== "production") {
        console.warn(
          `[FinLens] ${label}(${symbol}) ${fiscalYear}: sources disagree on "${anchorField}" beyond ` +
            `tolerance — ${candidates.map((c) => `${c.source}=${Number(c.row[anchorField]).toLocaleString("en-US")}`).join(", ")}.`
        );
      }
    }

    if (anchorField && candidates.length >= 3) {
      const withAnchor = candidates
        .map((c) => ({ ...c, value: Number(c.row[anchorField]) }))
        .filter((c) => Number.isFinite(c.value) && Math.abs(c.value) >= CROSS_VALIDATION_MIN_MAGNITUDE);
      const top = withAnchor.find((c) => c.source === winner.source);
      const others = withAnchor.filter((c) => c.source !== winner.source);
      if (top && others.length >= 2) {
        const othersAgree = relativeDifference(others[0].value, others[1].value) < CROSS_VALIDATION_AGREEMENT_TOLERANCE;
        const winnerIsOutlier =
          relativeDifference(top.value, others[0].value) > CROSS_VALIDATION_OUTLIER_TOLERANCE &&
          relativeDifference(top.value, others[1].value) > CROSS_VALIDATION_OUTLIER_TOLERANCE;
        if (othersAgree && winnerIsOutlier) {
          const demoted = winner;
          winner = others[0]; // the higher-priority of the two agreeing, corroborating sources
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[FinLens] ${label}(${symbol}) ${fiscalYear}: "${anchorField}" from ${demoted.source} ` +
                `(${Number(demoted.row[anchorField]).toLocaleString("en-US")}) is an outlier vs. ` +
                `${others[0].source} and ${others[1].source}, which agree with each other ` +
                `(${others[0].value.toLocaleString("en-US")} vs. ${others[1].value.toLocaleString("en-US")}) — ` +
                `using ${winner.source}'s row for this year instead of the default priority order.`
            );
          }
        }
      }
    }

    if (backfillZeroFields && backfillZeroFields.length > 0) {
      let patchedRow: T | null = null;
      for (const field of backfillZeroFields) {
        const currentVal = Number(winner.row[field]);
        if (!Number.isFinite(currentVal) || currentVal !== 0) continue; // only patch a genuine, suspicious 0
        const donor = candidates.find((c) => {
          if (c.source === winner.source) return false;
          const v = Number(c.row[field]);
          return Number.isFinite(v) && v !== 0;
        });
        if (!donor) continue;
        patchedRow = { ...(patchedRow ?? winner.row), [field]: donor.row[field] };
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[FinLens] ${label}(${symbol}) ${fiscalYear}: "${field}" from ${winner.source} was 0 — ` +
              `backfilled from ${donor.source}'s value (${Number(donor.row[field]).toLocaleString("en-US")}) ` +
              `for this field only. Every other field still comes from ${winner.source}.`
          );
        }
      }
      if (patchedRow) winner = { source: winner.source, row: patchedRow };
    }

    byYear.set(fiscalYear, {
      ...winner.row,
      dataSource: winner.source,
      dataDiscrepancy: dataDiscrepancy || undefined,
    });
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

/**
 * Dev-only diagnostic added after two independent, unverified-live bug
 * reports that share the same signature — a plausible real annual figure
 * followed by an implausible trailing (TTM/MRQ) one:
 *   - GOOGL: Total Assets $595B (last annual) -> $922B (MRQ), a 55%
 *     one-quarter jump.
 *   - AT&T: Total Debt $143.7B (last annual) -> $9.32B (MRQ), an ~93%
 *     one-quarter drop (almost exactly matching just the current portion
 *     of long-term debt, suggesting the quarterly LongTermDebtNoncurrent
 *     tag came back empty for that specific period while the smaller
 *     current-portion tag didn't).
 *
 * Neither could be root-caused without live SEC EDGAR/Yahoo access in
 * this sandbox (see this file's module doc comment on that limitation),
 * and — unlike the exactly-0 case backfillZeroFields handles — there's no
 * structurally safe automatic fix here: both fields CAN legitimately move
 * a lot in one quarter for a real reason (a major acquisition, a large
 * new bond issuance), so silently overriding either figure risks
 * suppressing a genuinely correct number. This only logs, so the data
 * shown is unchanged; it exists purely so an implausible trailing figure
 * is visible in server logs (with both values named) instead of silently
 * feeding wrong ratios (P/FCF, Debt-to-Equity, etc.) with no trace of why.
 */
export function warnIfTrailingRowImplausible<T extends YearRow>(
  label: string,
  symbol: string,
  historical: T[],
  trailing: T | null | undefined,
  anchorField: keyof T & string,
  /** How large a one-period move counts as "implausible" — defaults to 40%, loose enough that normal quarter-to-quarter movement never trips it. */
  threshold = 0.4
): void {
  if (process.env.NODE_ENV === "production") return;
  if (!trailing || historical.length === 0) return;
  const last = historical[historical.length - 1];
  const lastVal = Number(last[anchorField]);
  const trailingVal = Number(trailing[anchorField]);
  if (!Number.isFinite(lastVal) || !Number.isFinite(trailingVal)) return;
  if (Math.abs(lastVal) < 1_000_000) return; // same noise floor as warnIfDuplicateValuesAcrossYears
  const relDiff = Math.abs(trailingVal - lastVal) / Math.max(Math.abs(lastVal), Math.abs(trailingVal));
  if (relDiff > threshold) {
    console.warn(
      `[FinLens] ${label}(${symbol}): "${anchorField}" moved from ${lastVal.toLocaleString("en-US")} ` +
        `(${last.fiscalYear}) to ${trailingVal.toLocaleString("en-US")} (${trailing.fiscalYear}) — a ` +
        `${(relDiff * 100).toFixed(0)}% change in one period. Could be real (acquisition, major debt ` +
        `issuance) or a tag-mapping/dimensional-data artifact — verify against a raw SEC EDGAR/Yahoo ` +
        `payload before trusting either figure.`
    );
  }
}
