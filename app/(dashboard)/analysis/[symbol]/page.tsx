import { AlertTriangle } from "lucide-react";
import { getFundamentals } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";
import { isNonFundamentalQuote } from "@/lib/finance/exchange";
import { CompanyProfileHeader } from "@/components/ticker/CompanyProfileHeader";
import { CompanyMetricsAccordions } from "@/components/ticker/CompanyMetricsAccordions";
import { MobileTickerHeader } from "@/components/ticker/MobileTickerHeader";
import { LivePriceHeader } from "@/components/ticker/LivePriceHeader";
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

  const {
    quote,
    profile,
    metrics,
    income,
    balance,
    cashFlow,
    incomeQuarterly,
    balanceQuarterly,
    cashFlowQuarterly,
    estimates,
    priceTargets,
    history,
    reportingCurrency,
  } = bundle;

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
    // vanished. Fix: drop `items-start` (the default cross-axis `stretch`
    // makes both columns' boxes span the full (taller) row height — tops
    // still align exactly, since that's just where the row starts) and move
    // `sticky` onto an *inner* wrapper, which now has a tall parent to
    // stick within for as long as the right column keeps scrolling.
    //
    // QA fix (audit finding, layered on top of the above): this was CSS
    // Grid with a fixed `22rem 1fr` column template. At common desktop
    // widths that left the right (chart/tab) column meaningfully narrower
    // than the reference terminal's — every downstream chart grid inside it
    // was sized off that narrow column. Switched to `flex` with an explicit
    // `w-[22rem] shrink-0` left column instead of a grid track: identical
    // visual result (fixed-width left, fluid right) but the right column
    // now gets `flex-1` — flexbox's default `align-items: stretch` gives it
    // the exact same full-row-height box the sticky fix above depends on,
    // so nothing about that fix needed to change.
    <>
      <MobileTickerHeader quote={quote} />
      <div className="analysis-grid flex flex-col gap-6 lg:flex-row">
        <div className="order-2 w-full lg:order-1 lg:w-[22rem] lg:shrink-0">
          <div className="area-profile space-y-4 lg:sticky lg:top-6">
            <CompanyProfileHeader quote={quote} profile={profile} />
            {!isNonFundamental && (
              <CompanyMetricsAccordions metrics={metrics} reportingCurrency={reportingCurrency} />
            )}
          </div>
        </div>

        <div className="order-1 min-w-0 flex-1 space-y-6 lg:order-2">
          <LivePriceHeader symbol={quote.symbol} initialQuote={quote} />

          <ChartPanel
            history={history}
            currency={quote.currency}
            symbol={quote.symbol}
            exchange={quote.exchange}
            currentPrice={quote.price}
          />

          {!isNonFundamental && (
            <DataExplorerTabs
              income={income}
              balance={balance}
              cashFlow={cashFlow}
              incomeQuarterly={incomeQuarterly}
              balanceQuarterly={balanceQuarterly}
              cashFlowQuarterly={cashFlowQuarterly}
              estimates={estimates}
              priceTargets={priceTargets}
              reportingCurrency={reportingCurrency}
              quote={quote}
              metrics={metrics}
            />
          )}
        </div>
      </div>
    </>
  );
}
