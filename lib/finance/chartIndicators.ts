import type { PricePoint } from "./types";

/**
 * Full time-series technical indicator math for the Analysis page's chart
 * (components/ticker/PriceChart.tsx) — deliberately a SEPARATE module from
 * lib/finance/indicators.ts rather than an extension of it. That file's
 * computeRSI/computeSMA are single-latest-value functions purpose-built for
 * the Natural Language Strategy Builder's filter evaluation (lib/strategy/
 * execute.ts) and are documented as such; widening them to return full
 * series would blur that contract. Everything here instead returns a
 * date-keyed array suitable for lightweight-charts' `series.setData()`.
 *
 * These are standard, widely-used formulations (Wilder's RSI, the
 * "seed-then-recurrence" EMA), not a claim of exact bar-for-bar parity with
 * any specific charting platform's internal seeding convention — MACD in
 * particular uses a simplified EMA seed (first close, not a proper warm-up
 * SMA) for both legs, which is a common, defensible approximation used by
 * many lightweight charting implementations and converges to the same
 * values as more elaborate seeding after enough bars.
 */

export interface IndicatorPoint {
  time: string;
  value: number;
}

export interface BollingerPoint {
  time: string;
  upper: number;
  middle: number;
  lower: number;
}

export interface MacdResult {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: { time: string; value: number; color: string }[];
}

/** Exponential Moving Average, seeded with a plain SMA over the first `period` closes (the conventional way to start an EMA series without a full history's worth of runway). */
export function computeEmaSeries(data: PricePoint[], period: number): IndicatorPoint[] {
  if (data.length < period) return [];
  const closes = data.map((d) => d.close);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: IndicatorPoint[] = [{ time: data[period - 1].date, value: ema }];
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push({ time: data[i].date, value: ema });
  }
  return result;
}

/** Bollinger Bands: SMA middle band ± `mult` population standard deviations, the classic John Bollinger formulation (population, not sample, std dev). */
export function computeBollingerBands(data: PricePoint[], period = 20, mult = 2): BollingerPoint[] {
  if (data.length < period) return [];
  const closes = data.map((d) => d.close);
  const result: BollingerPoint[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    result.push({ time: data[i].date, upper: mean + mult * sd, middle: mean, lower: mean - mult * sd });
  }
  return result;
}

/** Wilder's RSI as a full time series (see lib/finance/indicators.ts's computeRSI doc comment for the same formulation — this just keeps every intermediate value instead of only the latest). */
export function computeRsiSeries(data: PricePoint[], period = 14): IndicatorPoint[] {
  if (data.length < period + 1) return [];
  const closes = data.map((d) => d.close);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiAt = (gain: number, loss: number) => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));

  const result: IndicatorPoint[] = [{ time: data[period].date, value: rsiAt(avgGain, avgLoss) }];
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push({ time: data[i].date, value: rsiAt(avgGain, avgLoss) });
  }
  return result;
}

const MACD_UP = "#10B981";
const MACD_DOWN = "#EF4444";

/** MACD (fast EMA − slow EMA), its signal line (EMA of the MACD line), and the histogram (MACD − signal). See module doc comment re: simplified EMA seeding. */
export function computeMacd(data: PricePoint[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const startIdx = slow + signalPeriod;
  if (data.length < startIdx + 1) return { macd: [], signal: [], histogram: [] };

  const closes = data.map((d) => d.close);
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);

  let emaFast = closes[0];
  let emaSlow = closes[0];
  const macdLine: number[] = [emaFast - emaSlow];
  for (let i = 1; i < closes.length; i++) {
    emaFast = closes[i] * kFast + emaFast * (1 - kFast);
    emaSlow = closes[i] * kSlow + emaSlow * (1 - kSlow);
    macdLine.push(emaFast - emaSlow);
  }

  const kSig = 2 / (signalPeriod + 1);
  let emaSignal = macdLine[0];
  const signalLine: number[] = [emaSignal];
  for (let i = 1; i < macdLine.length; i++) {
    emaSignal = macdLine[i] * kSig + emaSignal * (1 - kSig);
    signalLine.push(emaSignal);
  }

  const macd: IndicatorPoint[] = [];
  const signal: IndicatorPoint[] = [];
  const histogram: { time: string; value: number; color: string }[] = [];
  for (let i = startIdx; i < data.length; i++) {
    const m = macdLine[i];
    const s = signalLine[i];
    const h = m - s;
    macd.push({ time: data[i].date, value: m });
    signal.push({ time: data[i].date, value: s });
    histogram.push({ time: data[i].date, value: h, color: h >= 0 ? MACD_UP : MACD_DOWN });
  }
  return { macd, signal, histogram };
}
