import { BarChart3 } from "lucide-react";
import { IndexCard } from "@/components/dashboard/IndexCard";

// TA-125, S&P 500, NASDAQ Composite, Dow Jones, Bitcoin USD
// (see lib/finance/symbols.ts — kept in sync so the loading skeleton
// doesn't reflow once live data arrives)
const MARKET_SUMMARY_SLOTS = 5;

/** Loading-state skeleton — shown as the Suspense fallback for MarketSummarySection. */
export function MarketSummaryGrid() {
  return (
    <section>
      {/* Matches QuoteCardGrid's heading/icon-badge treatment exactly so nothing reflows when live data replaces this skeleton. */}
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
          <BarChart3 className="h-4 w-4" />
        </span>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Market Summary</h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {Array.from({ length: MARKET_SUMMARY_SLOTS }).map((_, i) => (
          <IndexCard key={i} />
        ))}
      </div>
    </section>
  );
}
