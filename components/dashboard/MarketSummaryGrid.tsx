import { IndexCard } from "@/components/dashboard/IndexCard";

// TA-125, S&P 500, NASDAQ Composite, Dow Jones, Bitcoin USD
// (see lib/finance/symbols.ts — kept in sync so the loading skeleton
// doesn't reflow once live data arrives)
const MARKET_SUMMARY_SLOTS = 5;

/** Loading-state skeleton — shown as the Suspense fallback for MarketSummarySection. */
export function MarketSummaryGrid() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Market Summary
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {Array.from({ length: MARKET_SUMMARY_SLOTS }).map((_, i) => (
          <IndexCard key={i} />
        ))}
      </div>
    </section>
  );
}
