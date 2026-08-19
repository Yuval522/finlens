import { BarChart3 } from "lucide-react";
import { IndexSummarySkeleton } from "@/components/dashboard/IndexSummarySkeleton";

// S&P 500, NASDAQ, Dow Jones, TA-125 (see lib/finance/symbols.ts — kept in
// sync so the loading skeleton doesn't reflow once live data arrives).
const MARKET_SUMMARY_SLOTS = 4;

/** Loading-state skeleton — shown as the Suspense fallback for MarketSummarySection. Mirrors its heading/grid exactly so nothing reflows when live data replaces this. */
export function MarketSummaryGrid() {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <BarChart3 className="h-4 w-4" />
        </span>
        <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Market Summary</h2>
      </div>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {Array.from({ length: MARKET_SUMMARY_SLOTS }).map((_, i) => (
          <IndexSummarySkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
