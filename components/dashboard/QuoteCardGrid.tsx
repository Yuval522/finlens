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

/** Presentational grid shared by the live Market Summary and Most Active sections. */
export function QuoteCardGrid({
  title,
  quotes,
  slots,
  error,
  columnsClassName = "sm:grid-cols-2 lg:grid-cols-3",
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

      <div className={cn("grid grid-cols-1 gap-3", columnsClassName)}>
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
