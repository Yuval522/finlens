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
}

// QA hotfix (Phase 4, re-tuned in Final Polish pass): fixed column counts
// (e.g. xl:grid-cols-5) squeezed each card too narrow for longer names like
// "NASDAQ Composite" or "ELBIT SYSTEMS" to render before truncating
// awkwardly. auto-fit/minmax gives every card a guaranteed minimum width —
// but the first pass's 240px floor was still too small: `auto-fit` packs in
// as many columns as fit at the *minimum* size, so on a wide desktop
// viewport it actually produced MORE narrow columns rather than fewer wide
// ones. A card needs roughly avatar(36px) + name text(~140px for a name
// like "NASDAQ Composite") + price/change column(~85px) + padding/gaps
// (~50px) ≈ 310px to avoid truncating; 280px keeps that comfortable for
// all but the longest company names, which still legitimately ellipsize.
const DEFAULT_COLUMNS = "grid-cols-[repeat(auto-fit,minmax(280px,1fr))]";

/** Presentational grid shared by the live Market Summary and Most Active sections. */
export function QuoteCardGrid({
  title,
  quotes,
  slots,
  error,
  columnsClassName = DEFAULT_COLUMNS,
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
          : quotes.map((q) => <MarketQuoteCard key={q.symbol} quote={q} />)}
      </div>

      {quotes !== null && quotes.length === 0 && !error && (
        <p className="mt-3 text-sm text-muted-foreground">
          No data available.
        </p>
      )}
    </section>
  );
}
