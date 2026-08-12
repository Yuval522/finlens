export type PortfolioRange = "1W" | "1M" | "1Y" | "ALL";

export const PORTFOLIO_RANGES: PortfolioRange[] = ["1W", "1M", "1Y", "ALL"];

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
}

const RANGE_CONFIG: Record<PortfolioRange, { days: number; stepDays: number }> = {
  "1W": { days: 7, stepDays: 1 },
  "1M": { days: 30, stepDays: 1 },
  "1Y": { days: 365, stepDays: 7 },
  ALL: { days: 730, stepDays: 14 },
};

/** Tiny deterministic PRNG (LCG) so the generated series is stable across re-renders for the same inputs, not re-randomized on every render. */
function makeRng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * FinLens has no backend recording daily portfolio-value snapshots (see
 * project notes — no user database), so there's no real history to plot.
 * This generates an illustrative value series instead: a smooth path from
 * `startValue` (cost basis, i.e. "where you started") to `endValue`
 * (today's actual total portfolio value, matching the header figure
 * exactly) with mild deterministic noise along the way so it doesn't look
 * like a perfectly straight synthetic line. Explicitly a visual stand-in,
 * not real historical data — every *current* number elsewhere on the page
 * (totals, gain/loss, holdings table) is computed live from real state.
 */
export function buildPortfolioHistory(
  range: PortfolioRange,
  startValue: number,
  endValue: number
): PortfolioHistoryPoint[] {
  const { days, stepDays } = RANGE_CONFIG[range];
  const rng = makeRng(Math.round(endValue * 1000) + days);
  const points: PortfolioHistoryPoint[] = [];
  const today = new Date();

  for (let d = days; d >= 0; d -= stepDays) {
    const t = 1 - d / days;
    const base = startValue + (endValue - startValue) * t;
    // Noise tapers to ~0 near the end so the series lands exactly on endValue.
    const noiseAmplitude = Math.max(endValue, 1) * 0.015 * (1 - t * 0.95);
    const noise = (rng() - 0.5) * 2 * noiseAmplitude;
    const value = d === 0 ? endValue : Math.max(0, base + noise);
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    points.push({ date: date.toISOString().slice(0, 10), value: Number(value.toFixed(2)) });
  }

  // Guarantee the series always ends exactly on today's real total, even if
  // stepDays didn't land precisely on d===0 for a given range.
  if (points[points.length - 1]?.date !== today.toISOString().slice(0, 10)) {
    points.push({ date: today.toISOString().slice(0, 10), value: Number(endValue.toFixed(2)) });
  }

  return points;
}
