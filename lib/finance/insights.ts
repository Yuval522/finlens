import type {
  BalanceSheetYear,
  CashFlowYear,
  EstimatesBundle,
  IncomeStatementYear,
  TickerMetrics,
} from "./types";

export type InsightSentiment = "positive" | "neutral" | "negative";

export interface Insight {
  id: string;
  title: string;
  sentiment: InsightSentiment;
  /** Short stat shown prominently, e.g. "+18.4%", "1.8x", "Net Cash". */
  headline: string;
  summary: string;
}

interface ComputeInsightsInput {
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  estimates: EstimatesBundle;
  metrics: TickerMetrics;
  currency: string;
}

function pct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/**
 * Deterministic, rule-based financial-analysis engine — the "AI Insights"
 * tab's real computations. This intentionally does NOT call an external
 * LLM: no AI provider key is configured anywhere in this app, and per
 * project convention (see lib/finance/providers/fmp.ts) we never fabricate
 * a live external call without credentials. Every insight below is derived
 * directly from the same fundamentals data already powering the other
 * tabs, using fixed, documented thresholds — reproducible and explainable
 * rather than a black box.
 */
export function computeInsights({
  income,
  balance,
  cashFlow,
  estimates,
  metrics,
  currency,
}: ComputeInsightsInput): Insight[] {
  const insights: Insight[] = [];

  const latestIncome = income[income.length - 1];
  const prevIncome = income[income.length - 2];

  // 1. Revenue growth
  if (latestIncome && prevIncome && prevIncome.totalRevenue > 0) {
    const growthPct =
      ((latestIncome.totalRevenue - prevIncome.totalRevenue) / prevIncome.totalRevenue) * 100;
    insights.push({
      id: "revenue-growth",
      title: "Revenue Growth",
      sentiment: growthPct >= 15 ? "positive" : growthPct >= 0 ? "neutral" : "negative",
      headline: pct(growthPct),
      summary: `Revenue ${growthPct >= 0 ? "grew" : "declined"} ${pct(Math.abs(growthPct)).replace(
        "+",
        ""
      )} YoY to ${compact(latestIncome.totalRevenue)} ${currency} in FY${latestIncome.fiscalYear}, vs ${compact(
        prevIncome.totalRevenue
      )} ${currency} the prior year.`,
    });
  }

  // 2. Operating margin trend
  if (latestIncome && prevIncome && latestIncome.totalRevenue > 0 && prevIncome.totalRevenue > 0) {
    const marginLatest = (latestIncome.operatingIncome / latestIncome.totalRevenue) * 100;
    const marginPrev = (prevIncome.operatingIncome / prevIncome.totalRevenue) * 100;
    const delta = marginLatest - marginPrev;
    insights.push({
      id: "margin-trend",
      title: "Operating Margin Trend",
      sentiment: delta >= 1 ? "positive" : delta <= -1 ? "negative" : "neutral",
      headline: `${marginLatest.toFixed(1)}%`,
      summary: `Operating margin ${
        delta >= 1 ? "expanded" : delta <= -1 ? "contracted" : "held roughly steady"
      } ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp YoY to ${marginLatest.toFixed(1)}% in FY${latestIncome.fiscalYear}.`,
    });
  }

  // 3. Rule of 40 (growth % + FCF margin %, falling back to operating margin
  // when there's no matching cash-flow year — same logic as the Income tab
  // chart, so the two stay consistent).
  if (latestIncome && prevIncome && prevIncome.totalRevenue > 0) {
    const growthPct = ((latestIncome.totalRevenue - prevIncome.totalRevenue) / prevIncome.totalRevenue) * 100;
    const matchingCf = cashFlow.find((c) => c.fiscalYear === latestIncome.fiscalYear);
    const marginPct =
      matchingCf && latestIncome.totalRevenue > 0
        ? (matchingCf.freeCashFlow / latestIncome.totalRevenue) * 100
        : latestIncome.totalRevenue > 0
          ? (latestIncome.operatingIncome / latestIncome.totalRevenue) * 100
          : 0;
    const ruleOf40 = growthPct + marginPct;
    insights.push({
      id: "rule-of-40",
      title: "Rule of 40",
      sentiment: ruleOf40 >= 40 ? "positive" : ruleOf40 >= 25 ? "neutral" : "negative",
      headline: `${ruleOf40.toFixed(0)}`,
      summary: `Growth (${pct(growthPct)}) plus ${matchingCf ? "FCF margin" : "operating margin (FCF unavailable)"} (${pct(
        marginPct
      )}) sums to ${ruleOf40.toFixed(0)}, ${
        ruleOf40 >= 40 ? "clearing" : "below"
      } the 40 benchmark investors use for growth-vs-profitability balance.`,
    });
  }

  // 4. Balance sheet health (net cash position + current ratio)
  const latestBalance = balance[balance.length - 1];
  if (latestBalance && metrics.balances.netCashPosition != null) {
    const netCash = metrics.balances.netCashPosition;
    const currentRatio =
      latestBalance.totalCurrentLiabilities > 0
        ? latestBalance.totalCurrentAssets / latestBalance.totalCurrentLiabilities
        : null;
    const netCashOk = netCash >= 0;
    const ratioOk = currentRatio == null || currentRatio >= 1;
    insights.push({
      id: "balance-sheet-health",
      title: "Balance Sheet Health",
      sentiment: netCashOk && ratioOk ? "positive" : netCashOk || ratioOk ? "neutral" : "negative",
      headline: netCashOk ? "Net Cash" : "Net Debt",
      summary: `${netCashOk ? "Net cash position" : "Net debt position"} of ${compact(Math.abs(netCash))} ${currency}${
        currentRatio != null ? `, with a current ratio of ${currentRatio.toFixed(2)}x` : ""
      } as of FY${latestBalance.fiscalYear}.`,
    });
  }

  // 5. Cash flow quality (FCF conversion vs net income, flagging heavy SBC)
  const latestCf = cashFlow[cashFlow.length - 1];
  if (latestCf && latestCf.netIncome !== 0) {
    const conversion = latestCf.freeCashFlow / latestCf.netIncome;
    const sbcPctRevenue = latestIncome && latestIncome.totalRevenue > 0
      ? (latestCf.stockBasedCompensation / latestIncome.totalRevenue) * 100
      : null;
    const highSbc = sbcPctRevenue != null && sbcPctRevenue > 5;
    insights.push({
      id: "cash-flow-quality",
      title: "Cash Flow Quality",
      sentiment: conversion >= 1 && !highSbc ? "positive" : conversion >= 0.7 ? "neutral" : "negative",
      headline: `${conversion.toFixed(1)}x`,
      summary: `Free cash flow ran ${conversion.toFixed(1)}x reported net income in FY${latestCf.fiscalYear}${
        sbcPctRevenue != null
          ? `; stock-based compensation was ${sbcPctRevenue.toFixed(1)}% of revenue${
              highSbc ? " — elevated enough to be a dilution watch item" : ""
            }`
          : ""
      }.`,
    });
  }

  // 6. Valuation context (forward PEG preferred, trailing/forward P/E as fallback)
  const { peRatio, forwardPE, forwardPeg } = metrics.financials;
  if (forwardPeg != null) {
    insights.push({
      id: "valuation",
      title: "Valuation",
      sentiment: forwardPeg < 1 ? "positive" : forwardPeg <= 2 ? "neutral" : "negative",
      headline: `${forwardPeg.toFixed(2)} PEG`,
      summary: `Forward PEG of ${forwardPeg.toFixed(2)} suggests the stock is ${
        forwardPeg < 1 ? "priced cheaply relative to" : forwardPeg <= 2 ? "reasonably priced against" : "priced at a premium to"
      } its expected growth rate.`,
    });
  } else if (peRatio != null && forwardPE != null) {
    const improving = forwardPE < peRatio;
    insights.push({
      id: "valuation",
      title: "Valuation",
      sentiment: improving ? "positive" : "neutral",
      headline: `${peRatio.toFixed(1)}x P/E`,
      summary: `Trades at ${peRatio.toFixed(1)}x trailing earnings vs ${forwardPE.toFixed(1)}x forward — ${
        improving ? "the multiple compresses as earnings are expected to grow" : "little near-term earnings growth priced in"
      }.`,
    });
  }

  // 7. Analyst track record (historical beat/miss rate)
  const historicalRows = [...estimates.annual, ...estimates.quarterly].filter(
    (r) => r.isHistorical && r.beat != null
  );
  if (historicalRows.length > 0) {
    const beats = historicalRows.filter((r) => r.beat).length;
    const beatRate = (beats / historicalRows.length) * 100;
    insights.push({
      id: "analyst-track-record",
      title: "Analyst Track Record",
      sentiment: beatRate >= 70 ? "positive" : beatRate >= 40 ? "neutral" : "negative",
      headline: `${beats}/${historicalRows.length} Beats`,
      summary: `Reported revenue beat consensus in ${beats} of the last ${historicalRows.length} tracked periods (${beatRate.toFixed(
        0
      )}%).`,
    });
  }

  return insights;
}
