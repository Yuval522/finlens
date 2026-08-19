import { BarChart3 } from "lucide-react";
import { IndexSummaryCard } from "@/components/dashboard/IndexSummaryCard";
import { getMarketSummary, getPriceHistory } from "@/lib/finance/yahoo";
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
 * Apple-HIG concept redesign: Market Summary is a horizontally scrollable
 * row (`.tab-scroll` — same no-visible-scrollbar utility the ticker tab
 * strip uses, plus scroll-snap so cards land cleanly on swipe/scroll) of
 * IndexSummaryCard's compact label/value/pill/sparkline layout, rather
 * than sharing QuoteCardGrid's logo-based MarketQuoteCard layout with Most
 * Active/Watchlist — see IndexSummaryCard's doc comment for why indices
 * get their own simpler treatment. A row instead of a wrapping grid means
 * adding more symbols later never re-crowds existing cards.
 *
 * Sparkline history is fetched in parallel with the quotes themselves
 * (outer Promise.all) rather than after. getPriceHistory() already
 * swallows its own per-symbol errors and resolves to `[]` (see its doc
 * comment in lib/finance/yahoo.ts) rather than throwing, so one symbol's
 * history failing just means that card renders without a sparkline — it
 * never blocks the numbers, which come from the separate getMarketSummary()
 * call.
 *
 * Async Server Component — fetched inside a <Suspense> boundary on the
 * home page.
 */
export async function MarketSummarySection() {
  try {
    const [quotes, histories] = await Promise.all([
      getMarketSummary(),
      Promise.all(MARKET_SUMMARY_SYMBOLS.map((s) => getPriceHistory(s.symbol, 30))),
    ]);
    const historyBySymbol = new Map(
      MARKET_SUMMARY_SYMBOLS.map((s, i) => [s.symbol, histories[i].map((p) => p.close)])
    );

    return (
      <section>
        <SectionHeading />
        <div className="tab-scroll flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-smooth pb-1">
          {quotes.map((q) => (
            <IndexSummaryCard
              key={q.symbol}
              quote={q}
              label={labelBySymbol.get(q.symbol) ?? q.name}
              history={historyBySymbol.get(q.symbol)}
            />
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
