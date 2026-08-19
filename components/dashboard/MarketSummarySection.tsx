import { BarChart3 } from "lucide-react";
import { IndexSummaryCard } from "@/components/dashboard/IndexSummaryCard";
import { getMarketSummary } from "@/lib/finance/yahoo";
import { MARKET_SUMMARY_SYMBOLS } from "@/lib/finance/symbols";
import { MarketDataError } from "@/lib/finance/types";

const labelBySymbol = new Map(MARKET_SUMMARY_SYMBOLS.map((s) => [s.symbol, s.label]));

function SectionHeading() {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <BarChart3 className="h-4 w-4" />
      </span>
      <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Market Summary</h2>
    </div>
  );
}

/**
 * Apple-HIG concept redesign: Market Summary is now a dedicated 4-card
 * grid of major indices (S&P 500, NASDAQ, Dow Jones, TA-125) using
 * IndexSummaryCard's compact label/value/pill layout, rather than sharing
 * QuoteCardGrid's logo-based MarketQuoteCard layout with Most
 * Active/Watchlist — see IndexSummaryCard's doc comment for why indices
 * get their own simpler treatment. Async Server Component — fetched
 * inside a <Suspense> boundary on the home page.
 */
export async function MarketSummarySection() {
  try {
    const quotes = await getMarketSummary();
    return (
      <section>
        <SectionHeading />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {quotes.map((q) => (
            <IndexSummaryCard key={q.symbol} quote={q} label={labelBySymbol.get(q.symbol) ?? q.name} />
          ))}
        </div>
      </section>
    );
  } catch (err) {
    const message =
      err instanceof MarketDataError
        ? err.message
        : "Market data is temporarily unavailable.";
    return (
      <section>
        <SectionHeading />
        <p className="hig-card px-3 py-2 text-xs text-destructive">{message}</p>
      </section>
    );
  }
}
