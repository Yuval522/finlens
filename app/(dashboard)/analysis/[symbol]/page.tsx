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
    // QA fix (regression found via live comparison against the reference
    // terminal): the previous pass gave both grid columns `items-start` so
    // their tops would align pixel-for-pixel — but that also meant the left
    // column's own box no longer stretched to the row's full height, only
    // to its own (much shorter) content height. `position: sticky` can only
    // stay pinned while *its own containing block* still intersects the
    // viewport — once you scrolled past that short box, the whole profile
    // card scrolled away with it instead of staying pinned, i.e. it just
    // vanished. Fix: drop `items-start` (grid's default `stretch` makes
    // both columns' boxes span the full (taller) row height — tops still
    // align exactly, since that's just where the row starts) and move
    // `sticky` onto an *inner* wrapper, which now has a tall parent to
    // stick within for as long as the right column keeps scrolling.
    <div className="analysis-grid grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="order-2 lg:order-1">
        <div className="area-profile space-y-4 lg:sticky lg:top-6">
          <CompanyProfileHeader quote={quote} profile={profile} />
          {!isNonFundamental && (
            <CompanyMetricsAccordions metrics={metrics} reportingCurrency={reportingCurrency} />
          )}
        </div>
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
