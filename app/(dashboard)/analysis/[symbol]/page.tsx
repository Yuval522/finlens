import { AlertTriangle } from "lucide-react";
import { getFundamentals } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";
import { isNonFundamentalQuote } from "@/lib/finance/exchange";
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

  const { quote, profile, metrics, income, balance, cashFlow, estimates, history, reportingCurrency } = bundle;

  // Indices (^GSPC, ^TA125.TA, ^IXIC, ...) — and, more broadly, commodities,
  // currency/forex pairs, and crypto — have no income statement, balance
  // sheet, cash flow, analyst estimates, or valuation to show; Yahoo simply
  // doesn't carry fundamentals data for any of these asset classes. Rather
  // than render a tab strip full of empty/broken panels, hide the entire
  // fundamentals section (tabs + the P/E-and-margins metrics accordions,
  // equally meaningless here) and show only the header card and price
  // chart, for every one of these asset types uniformly.
  const isNonFundamental = isNonFundamentalQuote(quote.symbol, quote.quoteType);

  return (
    // QA fix: the previous single grid with a "profile" area spanning 3
    // stacked rows (profile / price / chart / tabs) made the left column's
    // top edge and overall height dependent on a multi-row span calculation
    // that kept drifting out of sync with the right column in practice.
    // Two plain grid columns — each a normal, single-row-spanning item —
    // guarantee the left column's top edge is pixel-identical to the right
    // column's top edge with nothing more than `items-start`, and the
    // left column can still stick while the (much taller) right column
    // scrolls past it, same as before (see .area-profile in globals.css).
    // `order` keeps the original mobile stacking (price -> chart -> tabs,
    // then profile) even though profile is now the first DOM child.
    <div className="analysis-grid grid grid-cols-1 items-start gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="area-profile order-2 space-y-4 lg:order-1">
        <CompanyProfileHeader quote={quote} profile={profile} />
        {!isNonFundamental && (
          <CompanyMetricsAccordions metrics={metrics} reportingCurrency={reportingCurrency} />
        )}
      </div>

      <div className="order-1 space-y-6 lg:order-2">
        <PriceHeaderBlock quote={quote} />

        <ChartPanel
          history={history}
          currency={quote.currency}
          symbol={quote.symbol}
          exchange={quote.exchange}
        />

        {!isNonFundamental && (
          <DataExplorerTabs
            income={income}
            balance={balance}
            cashFlow={cashFlow}
            estimates={estimates}
            reportingCurrency={reportingCurrency}
            quote={quote}
            metrics={metrics}
          />
        )}
      </div>
    </div>
  );
}
