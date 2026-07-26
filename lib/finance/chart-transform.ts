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
