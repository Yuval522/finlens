/**
 * Shared range/view transforms for the fullscreen financial-chart modal
 * controls (Select Range, View: Absolute/YoY, Chart Type: Annually/
 * Quarterly). Generic over any row shape that has a `fiscalYear` string
 * field, so the same functions serve Income, Balance, and Cash Flow's
 * chart data without per-metric special casing. Real data transforms, not
 * cosmetic — Select Range genuinely slices the underlying array and View
 * genuinely recomputes values.
 *
 * Chart Type: Quarterly is real too now (see FundamentalsBundle's
 * `*Quarterly` fields in lib/finance/types.ts, populated from SEC EDGAR
 * 10-Qs / Yahoo / FMP — see lib/finance/aggregate.ts) — panels pass
 * whichever dataset (annual or quarterly) matches the current Chart Type
 * selection into filterByRange, with `periodsPerYear` set accordingly so
 * "5 Years" means 5 actual years' worth of periods either way (20
 * quarters, not 5).
 */

export type ChartRange = 3 | 5 | 10 | "All";
export const CHART_RANGES: ChartRange[] = [3, 5, 10, "All"];

export type ChartView = "absolute" | "yoy" | "pctOfRevenue";
export type ChartType = "annually" | "quarterly";

/**
 * Trailing-appendix fiscal-year labels: "TTM" (trailing twelve months —
 * Income Statement, Cash Flow) and "MRQ" (most recent quarter — Balance
 * Sheet, a point-in-time snapshot rather than a rolling flow figure). See
 * toTrailingIncomeRow/toTrailingCashFlowRow and the MRQ derivation in
 * getFundamentals() (yahoo.ts), and mock-data.ts's illustrative fixtures,
 * which use the same "TTM" convention by hand.
 */
const TRAILING_LABELS = new Set(["TTM", "MRQ"]);

/**
 * Splits a fiscal-year array into its real historical rows and the
 * trailing TTM/MRQ appendix row, if present. Exists so Select Range can
 * filter *only* the historical portion — appended directly, the trailing
 * row would otherwise get sliced away as one of the "N years" whenever a
 * narrow range is selected (e.g. "3 Years" would show only 2 real years +
 * TTM instead of 3 real years + TTM), which doesn't match how the
 * appendix is meant to behave: always present, on top of whichever range
 * is selected, the same way professional charting terminals show it.
 */
export function splitTrailingRow<T extends { fiscalYear: string }>(
  data: T[]
): { historical: T[]; trailing: T | null } {
  const trailing = data.find((row) => TRAILING_LABELS.has(row.fiscalYear)) ?? null;
  const historical = trailing ? data.filter((row) => row !== trailing) : data;
  return { historical, trailing };
}

export function filterByRange<T extends { fiscalYear: string }>(
  data: T[],
  range: ChartRange,
  periodsPerYear = 1
): T[] {
  if (range === "All") return data;
  return data.slice(Math.max(0, data.length - range * periodsPerYear));
}

/**
 * QA fix ("Select Range does nothing" report — traced to a real cause, but
 * not a wiring bug): filterByRange/the range state were already correctly
 * wired (verified again, function by function, before writing this). The
 * actual problem is upstream — every Stox dataset only ever has ~5
 * fiscal periods (mock-data.ts's illustrative fixtures are hand-authored
 * with exactly 4 years + TTM per ticker; live Yahoo data was previously
 * fetched with only a 6-year lookback window, see the bumped period1 in
 * yahoo.ts). With 5 total years available, filterByRange(data, 5),
 * filterByRange(data, 10), and filterByRange(data, "All") are all
 * *mathematically identical* — Math.max(0, 5-5) and Math.max(0, 5-10) both
 * equal 0, so both slice from index 0, same as "All". Only "3 Years" ever
 * produced a visibly different result. Selecting through 5 → 10 → All and
 * seeing the exact same chart every time isn't a bug in the filter — it's
 * three options that were never capable of differing, given the data
 * depth, being presented as if they were meaningfully distinct choices.
 * This filters CHART_RANGES down to only the options that would actually
 * produce a different slice than the next-broadest one, so the dropdown
 * never offers a choice that's silently a no-op.
 */
export function getAvailableRanges(totalYears: number): ChartRange[] {
  const usable = CHART_RANGES.filter((r) => r === "All" || r < totalYears);
  return usable.length > 0 ? usable : ["All"];
}

/**
 * Converts the given numeric keys to year-over-year percent change,
 * dropping the first row (no prior year to compare against). Non-numeric
 * or missing values pass through as 0 rather than throwing, since a
 * missing prior-year figure shouldn't crash the whole chart.
 */
export function toYoY<T extends { fiscalYear: string }>(data: T[], keys: (keyof T)[]): T[] {
  const rows = data.slice(1).map((row, idx) => {
    const prev = data[idx];
    const out = { ...row } as T;
    for (const key of keys) {
      const curVal = Number(row[key]);
      const prevVal = Number(prev[key]);
      const pct = Number.isFinite(curVal) && Number.isFinite(prevVal) && prevVal !== 0 ? ((curVal - prevVal) / Math.abs(prevVal)) * 100 : 0;
      (out as Record<string, unknown>)[key as string] = Number(pct.toFixed(1));
    }
    return out;
  });
  return rows;
}

/**
 * Converts the given numeric keys to a percent of that same row's revenue
 * figure (e.g. Gross Profit -> Gross Margin %). Unlike toYoY, this doesn't
 * drop any rows — every row (including an appended TTM) has its own
 * revenue figure to divide by, no prior-period comparison needed. Revenue
 * values of 0 or missing pass through as 0 rather than dividing by zero.
 */
export function toPctOfRevenue<T extends { fiscalYear: string }>(
  data: T[],
  keys: (keyof T)[],
  revenueKey: keyof T
): T[] {
  return data.map((row) => {
    const revenue = Number(row[revenueKey]);
    const out = { ...row } as T;
    for (const key of keys) {
      const val = Number(row[key]);
      const pct = Number.isFinite(val) && Number.isFinite(revenue) && revenue !== 0 ? (val / revenue) * 100 : 0;
      (out as Record<string, unknown>)[key as string] = Number(pct.toFixed(1));
    }
    return out;
  });
}

/**
 * Arithmetic mean of a numeric field across a data array — the shared
 * primitive behind every chart's "dynamic average" dashed ReferenceLine
 * (see SingleMetricChart's showAverage prop in IncomeStatementPanel.tsx,
 * and RuleOf40Card in the same file). Deliberately generic over any row
 * shape/key so one function backs Operating Income's average line, Rule of
 * 40's, and any future metric that wants one — it has no opinion about
 * Select Range, View, or Chart Type; it just averages whatever array is
 * handed to it. Every caller in this codebase passes the SAME array it's
 * about to render as bars, so the average automatically reflects the
 * user's current Select Range/View/Chart Type selections without this
 * function needing to know anything about them. Non-finite values (missing
 * data coerced via Number()) are excluded from both the sum and the count,
 * rather than treated as 0, so a gap doesn't silently drag the average
 * down. Returns null for an empty array or an array with no finite values,
 * rather than NaN.
 */
export function computeAverage<T>(data: T[], key: keyof T): number | null {
  const values = data.map((row) => Number(row[key])).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
