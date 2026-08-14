import type { StrategyMetric, StrategyOperator } from "./types";

/**
 * Shared human-readable labels/formatting for the Strategy Builder's
 * closed-vocabulary metrics — used by execute.ts (relaxed/near-miss
 * explanations), and the UI (results table headers, quick-insert metric
 * hints). Centralized so all three never drift into describing the same
 * metric differently.
 */

export const STRATEGY_METRIC_LABELS: Record<StrategyMetric, string> = {
  price: "Price",
  changePercent: "Change today",
  marketCap: "Market cap",
  peRatio: "P/E ratio",
  dividendYieldPercent: "Dividend yield",
  volume: "Volume",
  rsi14: "RSI (14-day)",
  priceVsSma50: "vs. 50-day average",
  priceVsSma200: "vs. 200-day average",
};

export const STRATEGY_OPERATOR_LABELS: Record<StrategyOperator, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
};

export function formatStrategyMetricValue(metric: StrategyMetric, value: number): string {
  switch (metric) {
    case "marketCap":
    case "volume": {
      const abs = Math.abs(value);
      if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return String(Math.round(value));
    }
    case "price":
      return `$${value.toFixed(2)}`;
    case "peRatio":
      return `${value.toFixed(1)}x`;
    case "changePercent":
    case "dividendYieldPercent":
    case "priceVsSma50":
    case "priceVsSma200":
      return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
    case "rsi14":
      return value.toFixed(0);
  }
}
