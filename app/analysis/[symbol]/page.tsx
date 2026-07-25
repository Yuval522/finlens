import { AlertTriangle } from "lucide-react";
import { getFundamentals } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";
import { CompanyProfileHeader } from "@/components/ticker/CompanyProfileHeader";
import { CompanyMetricsAccordions } from "@/components/ticker/CompanyMetricsAccordions";
import { PriceHeaderBlock } from "@/components/ticker/PriceHeaderBlock";
import { ChartPanel } from "@/components/ticker/ChartPanel";
import { DataExplorerTabs } from "@/components/ticker/DataExplorerTabs";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = decodeURIComponent(rawSymbol);

  let bundle = null;
  let error: string | null = null;
  try {
    bundle = await getFundamentals(symbol);
  } catch (err) {
    error =
      err instanceof MarketDataError
        ? err.message
        : "Unable to load this symbol right now";
  }

  if (error || !bundle) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl !border-dashed py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <h1 className="font-mono text-lg font-semibold">{symbol}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error ?? "No data found for this symbol."}
        </p>
      </div>
    );
  }

  const { quote, profile, metrics, income, balance, history, reportingCurrency } = bundle;

  return (
    <div className="analysis-grid">
      <div className="area-profile space-y-4">
        <CompanyProfileHeader quote={quote} profile={profile} />
        <CompanyMetricsAccordions metrics={metrics} reportingCurrency={reportingCurrency} />
      </div>

      <div className="area-price">
        <PriceHeaderBlock quote={quote} />
      </div>

      <div className="area-chart">
        <ChartPanel
          history={history}
          currency={quote.currency}
          symbol={quote.symbol}
          exchange={quote.exchange}
        />
      </div>

      <div className="area-tabs">
        <DataExplorerTabs
          income={income}
          balance={balance}
          reportingCurrency={reportingCurrency}
          quote={quote}
          metrics={metrics}
        />
      </div>
    </div>
  );
}
