/**
 * Shared range/view transforms for the fullscreen financial-chart modal
 * controls (Select Range, View: Absolute/YoY). Generic over any row shape
 * that has a `fiscalYear` string field, so the same two functions serve
 * Income, Balance, and Cash Flow's chart data without per-metric special
 * casing. Real data transforms, not cosmetic — Select Range genuinely
 * slices the underlying array and View genuinely recomputes values, so a
 * user can only pick "Chart Type: Annually" (Quarterly isn't offered)
 * because FinLens's fundamentals data model is annual-only for now — see
 * lib/finance/types.ts. Faking a Quarterly toggle with annual data
 * repeated 4x would be actively misleading, so it's left out rather than
 * stubbed.
 */

export type ChartRange = 3 | 5 | 10 | "All";
export const CHART_RANGES: ChartRange[] = [3, 5, 10, "All"];

export type ChartView = "absolute" | "yoy";

export function filterByRange<T extends { fiscalYear: string }>(data: T[], range: ChartRange): T[] {
  if (range === "All") return data;
  return data.slice(Math.max(0, data.length - range));
}

/**
 * QA fix ("Select Range does nothing" report — traced to a real cause, but
 * not a wiring bug): filterByRange/the range state were already correctly
 * wired (verified again, function by function, before writing this). The
 * actual problem is upstream — every FinLens dataset only ever has ~5
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
