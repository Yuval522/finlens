import type { PortfolioCash, PortfolioHolding } from "./store";

/**
 * Fixed, approximate display-only conversion rate — Stox has no live FX
 * feed wired up (see project notes on network access), so the USD/ILS
 * toggle on the portfolio header converts using this constant rather than
 * a real-time rate. Good enough for a display toggle; not to be relied on
 * for anything financial.
 */
export const USD_TO_ILS_RATE = 3.7;

export interface HoldingComputed extends PortfolioHolding {
  positionValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
  /** Approximate today's $ swing for this position (currentPrice implies changePercent). */
  dailyGainLoss: number;
}

export function computeHolding(h: PortfolioHolding): HoldingComputed {
  const positionValue = h.shares * h.currentPrice;
  const costBasis = h.shares * h.purchasePrice;
  const gainLoss = positionValue - costBasis;
  const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  // changePercent is today's move; back out yesterday's close to get $ swing.
  const previousClose = h.changePercent !== -100 ? h.currentPrice / (1 + h.changePercent / 100) : 0;
  const dailyGainLoss = (h.currentPrice - previousClose) * h.shares;
  return { ...h, positionValue, costBasis, gainLoss, gainLossPercent, dailyGainLoss };
}

export interface PortfolioTotals {
  totalPositionValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dailyGainLoss: number;
  dailyGainLossPercent: number;
  totalDividendsPaid: number;
  blendedDividendYieldPercent: number;
  totalCashUsd: number;
  /** Position value + cash, all in USD terms. */
  totalPortfolioValueUsd: number;
}

export function computePortfolioTotals(holdings: PortfolioHolding[], cash: PortfolioCash): PortfolioTotals {
  const computed = holdings.map(computeHolding);
  const totalPositionValue = computed.reduce((sum, h) => sum + h.positionValue, 0);
  const totalCostBasis = computed.reduce((sum, h) => sum + h.costBasis, 0);
  const totalGainLoss = totalPositionValue - totalCostBasis;
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
  const dailyGainLoss = computed.reduce((sum, h) => sum + h.dailyGainLoss, 0);
  const previousTotalValue = totalPositionValue - dailyGainLoss;
  const dailyGainLossPercent = previousTotalValue > 0 ? (dailyGainLoss / previousTotalValue) * 100 : 0;
  const totalDividendsPaid = computed.reduce((sum, h) => sum + h.dividendsPaid, 0);
  const blendedDividendYieldPercent =
    totalPositionValue > 0
      ? computed.reduce((sum, h) => sum + h.positionValue * (h.dividendYieldPercent / 100), 0) / totalPositionValue * 100
      : 0;
  const totalCashUsd = cash.usd + cash.ils / USD_TO_ILS_RATE;
  const totalPortfolioValueUsd = totalPositionValue + totalCashUsd;

  return {
    totalPositionValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPercent,
    dailyGainLoss,
    dailyGainLossPercent,
    totalDividendsPaid,
    blendedDividendYieldPercent,
    totalCashUsd,
    totalPortfolioValueUsd,
  };
}
