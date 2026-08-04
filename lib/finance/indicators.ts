import type { PricePoint } from "./types";

/**
 * Technical indicator calculations for the Natural Language Strategy
 * Builder (lib/strategy/execute.ts). Pure functions over a plain array of
 * closes — no fetching, no caching, no knowledge of symbols — so they're
 * trivially unit-testable and reusable if a future feature (e.g. a chart
 * overlay) wants the same math.
 *
 * Deliberately a small, well-understood set (RSI-14, SMA) rather than a
 * large indicator library: each one here is exactly what the Strategy
 * Builder's filter schema (lib/strategy/types.ts) exposes to the LLM, and
 * every indicator added here is one more thing that has to be documented
 * in that schema's prompt and kept numerically correct — better to ship a
 * few indicators that are verified correct than many that aren't.
 */

/**
 * Wilder's RSI (Relative Strength Index) — the standard, original
 * formulation (not the simple-moving-average variant some libraries use):
 * the first average gain/loss is a plain mean over the first `period`
 * changes, and every subsequent value is a smoothed (Wilder) moving
 * average: avg = (prevAvg * (period - 1) + current) / period. This is the
 * formulation RSI-14 conventionally refers to and what most charting
 * platforms (including the one this app's UI is modeled on) compute.
 *
 * Returns null if there isn't enough data (`closes.length` must be at
 * least `period + 1`, since RSI is computed from day-over-day changes).
 */
export function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100; // no losses in the window at all — RSI is defined as 100 (or 50 for a fully flat series)
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Simple Moving Average over the most recent `period` closes. Returns null if there isn't enough data. */
export function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const window = closes.slice(closes.length - period);
  const sum = window.reduce((a, b) => a + b, 0);
  return sum / period;
}

/** Convenience: extracts a plain ascending-chronological close-price array from PricePoint[] (yahoo.ts's getPriceHistory already returns chronological order, but this re-sorts defensively since indicator math is meaningless on an out-of-order series). */
export function closesFromHistory(history: PricePoint[]): number[] {
  return [...history].sort((a, b) => a.date.localeCompare(b.date)).map((p) => p.close);
}
