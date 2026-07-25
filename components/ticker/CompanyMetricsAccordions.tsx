import { MetricAccordionGroup, type MetricRow } from "./MetricAccordionGroup";
import { formatMarketCap } from "@/lib/format/currency";
import type { TickerMetrics } from "@/lib/finance/types";

interface CompanyMetricsAccordionsProps {
  metrics: TickerMetrics;
  reportingCurrency: string;
}

function ratio(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}x`;
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}

export function CompanyMetricsAccordions({
  metrics,
  reportingCurrency,
}: CompanyMetricsAccordionsProps) {
  const financials: MetricRow[] = [
    { label: "Market Cap", value: formatMarketCap(metrics.financials.marketCap, reportingCurrency) },
    { label: "P/E", value: ratio(metrics.financials.peRatio) },
    { label: "Fwd P/E", value: ratio(metrics.financials.forwardPE) },
    { label: "Fwd PEG", value: ratio(metrics.financials.forwardPeg) },
    { label: "P/CF", value: ratio(metrics.financials.priceToCashFlow) },
    { label: "P/FCF", value: ratio(metrics.financials.priceToFreeCashFlow) },
  ];

  const yields: MetricRow[] = [
    { label: "Earnings Yield", value: pct(metrics.yields.earningsYield) },
    { label: "Cash Flow Yield", value: pct(metrics.yields.cashFlowYield) },
    { label: "FCF Yield", value: pct(metrics.yields.freeCashFlowYield) },
    { label: "Dividend Yield", value: pct(metrics.yields.dividendYield) },
    { label: "Payout Ratio", value: pct(metrics.yields.payoutRatio) },
  ];

  const balances: MetricRow[] = [
    { label: "Total Cash", value: formatMarketCap(metrics.balances.totalCash, reportingCurrency) },
    { label: "Total Debt", value: formatMarketCap(metrics.balances.totalDebt, reportingCurrency) },
    {
      label: "Net Cash Position",
      value: formatMarketCap(metrics.balances.netCashPosition, reportingCurrency),
    },
  ];

  const margins: MetricRow[] = [
    { label: "Gross Margin", value: pct(metrics.margins.grossMargin) },
    { label: "Operating Margin", value: pct(metrics.margins.operatingMargin) },
    { label: "Net Income Margin", value: pct(metrics.margins.netIncomeMargin) },
  ];

  return (
    <div className="glass-card rounded-2xl px-4 sm:px-5">
      <MetricAccordionGroup title="Financials" items={financials} defaultOpen />
      <MetricAccordionGroup title="Yields" items={yields} />
      <MetricAccordionGroup title="Balances" items={balances} />
      <MetricAccordionGroup title="Margins" items={margins} />
    </div>
  );
}
