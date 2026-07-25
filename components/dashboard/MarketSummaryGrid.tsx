import { IndexCard } from "@/components/dashboard/IndexCard";

// TA-125, S&P 500, NASDAQ Composite, Dow Jones, Russell 2000, Bitcoin USD
const MARKET_SUMMARY_SLOTS = 6;

export function MarketSummaryGrid() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Market Summary
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: MARKET_SUMMARY_SLOTS }).map((_, i) => (
          <IndexCard key={i} />
        ))}
      </div>
    </section>
  );
}
