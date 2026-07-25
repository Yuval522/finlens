import { IndexCard } from "@/components/dashboard/IndexCard";
import { MarketQuoteCard } from "@/components/dashboard/MarketQuoteCard";
import type { MarketQuote } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

interface QuoteCardGridProps {
  title: string;
  /** null renders `slots` skeleton cards (loading state) */
  quotes: MarketQuote[] | null;
  slots: number;
  error?: string | null;
  columnsClassName?: string;
  /** Passed through to each MarketQuoteCard — the /watchlist page opts in for a remove affordance. */
  showWatchlistToggle?: boolean;
  emptyMessage?: string;
}

// QA hotfix (Phase 4, re-tuned in Final Polish pass, widened again in the
// density-polish pass): fixed column counts (e.g. xl:grid-cols-5) squeezed
// each card too narrow for longer names like "NASDAQ Composite" or "ELBIT
// SYSTEMS" to render before truncating awkwardly. auto-fit/minmax gives
// every card a guaranteed minimum width — but the first pass's 240px floor
// was still too small: `auto-fit` packs in as many columns as fit at the
// *minimum* size, so on a wide desktop viewport it actually produced MORE
// narrow columns rather than fewer wide ones. MarketQuoteCard's density
// pass bumped its own padding (p-4 -> p-5) and avatar size (36 -> 40px) to
// close the visual gap with the reference terminal, which needs a
// correspondingly larger floor: avatar(40px) + name text(~140px) +
// price/change column(~85px) + padding/gaps(~55px) ≈ 320px; 300px keeps
// that comfortable for all but the longest company names.
const DEFAULT_COLUMNS = "grid-cols-[repeat(auto-fit,minmax(300px,1fr))]";

/** Presentational grid shared by the live Market Summary and Most Active sections. */
export function QuoteCardGrid({
  title,
  quotes,
  slots,
  error,
  columnsClassName = DEFAULT_COLUMNS,
  showWatchlistToggle = false,
  emptyMessage = "No data available.",
}: QuoteCardGridProps) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        {title}
      </h2>

      {error && (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className={cn("grid gap-3", columnsClassName)}>
        {quotes === null
          ? Array.from({ length: slots }).map((_, i) => <IndexCard key={i} />)
          : quotes.map((q) => (
              <MarketQuoteCard key={q.symbol} quote={q} showWatchlistToggle={showWatchlistToggle} />
            ))}
      </div>

      {quotes !== null && quotes.length === 0 && !error && (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
