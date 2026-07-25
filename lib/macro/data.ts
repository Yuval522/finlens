/**
 * Macro & economic indicator data — illustrative, hand-authored figures
 * (order-of-magnitude realistic as of early 2026), NOT live data. Same
 * "clearly documented mock" philosophy as lib/finance/mock-data.ts: there's
 * no live macro data provider wired up in this build (FRED/BLS/Treasury
 * APIs aren't integrated), so this gives the /macro page a real-shaped,
 * deterministic history to render instead of shipping an empty page.
 * Yearly anchor values are hand-picked to roughly track the real shape of
 * each series (rate hikes starting 2022, inflation peak in 2022–23, etc.);
 * monthly points between anchors are linearly interpolated with a small
 * deterministic wiggle so the line charts don't look robotically straight.
 */

export interface MacroPoint {
  date: string; // YYYY-MM-01
  value: number;
}

export type MacroRange = "1Y" | "5Y" | "MAX";
export const MACRO_RANGES: MacroRange[] = ["1Y", "5Y", "MAX"];

export interface MacroSeries {
  id: string;
  label: string;
  unit: string; // suffix, e.g. "%"
  description: string;
  color: string;
  history: MacroPoint[]; // monthly, oldest -> newest, Jan 2016 -> latest
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Yearly anchor values (Jan of each year) -> monthly-interpolated MacroPoint[] through the latest full month. */
function buildMonthlySeries(seed: string, anchors: [number, number][], noisePct = 0.02): MacroPoint[] {
  const rand = mulberry32(hashString(seed));
  const points: MacroPoint[] = [];
  const now = new Date();
  const lastYear = now.getFullYear();
  const lastMonth = now.getMonth(); // 0-indexed

  for (let i = 0; i < anchors.length - 1; i++) {
    const [yearA, valA] = anchors[i];
    const [yearB, valB] = anchors[i + 1];
    const monthsBetween = (yearB - yearA) * 12;
    for (let m = 0; m < monthsBetween; m++) {
      const year = yearA + Math.floor(m / 12);
      const month = m % 12;
      if (year > lastYear || (year === lastYear && month > lastMonth)) break;
      const t = m / monthsBetween;
      const base = valA + (valB - valA) * t;
      const wiggle = (rand() - 0.5) * 2 * noisePct * Math.abs(valB - valA || valA || 1);
      points.push({ date: `${year}-${String(month + 1).padStart(2, "0")}-01`, value: Number((base + wiggle).toFixed(2)) });
    }
  }
  return points;
}

const FED_FUNDS_ANCHORS: [number, number][] = [
  [2016, 0.5], [2017, 1.25], [2018, 2.25], [2019, 1.75], [2020, 0.25],
  [2021, 0.25], [2022, 4.25], [2023, 5.25], [2024, 4.5], [2025, 4.0], [2026, 3.75],
];
const CPI_YOY_ANCHORS: [number, number][] = [
  [2016, 1.3], [2017, 2.1], [2018, 2.4], [2019, 2.3], [2020, 1.4],
  [2021, 4.7], [2022, 8.0], [2023, 4.1], [2024, 3.0], [2025, 2.6], [2026, 2.4],
];
const UNEMPLOYMENT_ANCHORS: [number, number][] = [
  [2016, 4.9], [2017, 4.4], [2018, 3.9], [2019, 3.6], [2020, 8.1],
  [2021, 5.4], [2022, 3.6], [2023, 3.7], [2024, 4.0], [2025, 4.2], [2026, 4.1],
];
const US10Y_ANCHORS: [number, number][] = [
  [2016, 2.0], [2017, 2.4], [2018, 2.9], [2019, 2.1], [2020, 0.9],
  [2021, 1.5], [2022, 3.9], [2023, 4.0], [2024, 4.3], [2025, 4.5], [2026, 4.2],
];
const GDP_GROWTH_ANCHORS: [number, number][] = [
  [2016, 1.8], [2017, 2.5], [2018, 3.0], [2019, 2.6], [2020, -2.2],
  [2021, 5.8], [2022, 2.1], [2023, 2.9], [2024, 2.7], [2025, 2.3], [2026, 2.0],
];

export const MACRO_SERIES: MacroSeries[] = [
  {
    id: "fed-funds",
    label: "US Fed Funds Rate",
    unit: "%",
    description: "Federal Reserve target rate (upper bound)",
    color: "#6366F1",
    history: buildMonthlySeries("fed-funds", FED_FUNDS_ANCHORS, 0.01),
  },
  {
    id: "cpi",
    label: "Inflation (CPI YoY)",
    unit: "%",
    description: "Consumer Price Index, year-over-year",
    color: "#F59E0B",
    history: buildMonthlySeries("cpi", CPI_YOY_ANCHORS, 0.03),
  },
  {
    id: "unemployment",
    label: "Unemployment Rate",
    unit: "%",
    description: "US civilian unemployment rate",
    color: "#38BDF8",
    history: buildMonthlySeries("unemployment", UNEMPLOYMENT_ANCHORS, 0.02),
  },
  {
    id: "us10y",
    label: "US 10Y Treasury Yield",
    unit: "%",
    description: "10-year US Treasury bond yield",
    color: "#10B981",
    history: buildMonthlySeries("us10y", US10Y_ANCHORS, 0.02),
  },
  {
    id: "gdp",
    label: "US GDP Growth",
    unit: "%",
    description: "Real GDP growth, year-over-year",
    color: "#EC4899",
    history: buildMonthlySeries("gdp", GDP_GROWTH_ANCHORS, 0.05),
  },
];

/** Slices a series' full monthly history down to the requested trailing range. */
export function sliceMacroRange(history: MacroPoint[], range: MacroRange): MacroPoint[] {
  if (range === "MAX" || history.length === 0) return history;
  const months = range === "1Y" ? 12 : 60;
  return history.slice(Math.max(0, history.length - months));
}
