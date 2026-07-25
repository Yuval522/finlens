import type { BalanceSheetYear, IncomeStatementYear, TickerMetrics } from "./types";

export interface RatioItem {
  label: string;
  value: number | null;
  format: "ratio" | "percent";
  /** Shown as a footnote/tooltip when the ratio is an approximation of the textbook formula. */
  note?: string;
}

export interface RatioCategory {
  title: string;
  items: RatioItem[];
}

interface ComputeRatiosInput {
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  metrics: TickerMetrics;
}

/**
 * Institutional-style ratio matrix, computed entirely from data already in
 * the fundamentals bundle — no new data source needed. A couple of ratios
 * are honestly-labeled approximations: this data model doesn't break out
 * inventory or receivables separately, so Quick Ratio substitutes Cash &
 * ST Investments (the standard "acid-test" formula would subtract
 * inventory from current assets instead).
 */
export function computeRatios({ income, balance, metrics }: ComputeRatiosInput): RatioCategory[] {
  const latestIncome = income[income.length - 1];
  const latestBalance = balance[balance.length - 1];

  const currentRatio =
    latestBalance && latestBalance.totalCurrentLiabilities > 0
      ? latestBalance.totalCurrentAssets / latestBalance.totalCurrentLiabilities
      : null;
  const quickRatio =
    latestBalance && latestBalance.totalCurrentLiabilities > 0
      ? latestBalance.cashAndShortTermInvestments / latestBalance.totalCurrentLiabilities
      : null;
  const cashRatio =
    latestBalance && latestBalance.totalCurrentLiabilities > 0
      ? latestBalance.totalCash / latestBalance.totalCurrentLiabilities
      : null;

  const roe =
    latestIncome && latestBalance && latestBalance.totalStockholdersEquity !== 0
      ? (latestIncome.netIncome / latestBalance.totalStockholdersEquity) * 100
      : null;
  const roa =
    latestIncome && latestBalance && latestBalance.totalAssets !== 0
      ? (latestIncome.netIncome / latestBalance.totalAssets) * 100
      : null;

  const debtToEquity =
    latestBalance && latestBalance.totalStockholdersEquity !== 0
      ? latestBalance.totalDebt / latestBalance.totalStockholdersEquity
      : null;
  const debtToAssets =
    latestBalance && latestBalance.totalAssets > 0 ? latestBalance.totalDebt / latestBalance.totalAssets : null;
  const equityMultiplier =
    latestBalance && latestBalance.totalStockholdersEquity !== 0
      ? latestBalance.totalAssets / latestBalance.totalStockholdersEquity
      : null;

  const assetTurnover =
    latestIncome && latestBalance && latestBalance.totalAssets > 0
      ? latestIncome.totalRevenue / latestBalance.totalAssets
      : null;

  return [
    {
      title: "Liquidity Ratios",
      items: [
        { label: "Current Ratio", value: currentRatio, format: "ratio" },
        {
          label: "Quick Ratio",
          value: quickRatio,
          format: "ratio",
          note: "Approximated as Cash & ST Investments ÷ Current Liabilities — inventory and receivables aren't broken out separately in this data model.",
        },
        { label: "Cash Ratio", value: cashRatio, format: "ratio" },
      ],
    },
    {
      title: "Profitability Ratios",
      items: [
        { label: "Return on Equity (ROE)", value: roe, format: "percent" },
        { label: "Return on Assets (ROA)", value: roa, format: "percent" },
        { label: "Gross Margin", value: metrics.margins.grossMargin, format: "percent" },
        { label: "Operating Margin", value: metrics.margins.operatingMargin, format: "percent" },
        { label: "Net Margin", value: metrics.margins.netIncomeMargin, format: "percent" },
      ],
    },
    {
      title: "Solvency Ratios",
      items: [
        { label: "Debt-to-Equity", value: debtToEquity, format: "ratio" },
        { label: "Debt-to-Assets", value: debtToAssets, format: "ratio" },
        { label: "Equity Multiplier", value: equityMultiplier, format: "ratio" },
      ],
    },
    {
      title: "Efficiency Ratios",
      items: [{ label: "Asset Turnover", value: assetTurnover, format: "ratio" }],
    },
  ];
}
