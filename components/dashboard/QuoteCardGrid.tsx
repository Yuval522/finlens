import type { LucideIcon } from "lucide-react";
import { IndexCard } from "@/components/dashboard/IndexCard";
import { MarketQuoteCard } from "@/components/dashboard/MarketQuoteCard";
import type { LiveQuoteTick } from "@/lib/finance/useLiveQuotes";
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
  /** Section badge icon (e.g. BarChart3 for Market Summary, TrendingUp for Most Active). Omit for a plain heading. */
  icon?: LucideIcon;
  /** Tailwind bg/text classes for the icon's rounded-square badge, e.g. "bg-blue-500/15 text-blue-400". */
  iconClassName?: string;
  /** Live Trading Feed ticks keyed by symbol (see useLiveQuotes) — optional, so sections that don't poll live (Market Summary, Most Active) render unchanged. */
  ticks?: Map<string, LiveQuoteTick>;
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

/** Presentational grid shared by the live Market Summary, Most Active, and Watchlist sections. */
export function QuoteCardGrid({
  title,
  quotes,
  slots,
  error,
  columnsClassName = DEFAULT_COLUMNS,
  showWatchlistToggle = false,
  emptyMessage = "No data available.",
  icon: Icon,
  iconClassName,
  ticks,
}: QuoteCardGridProps) {
  return (
    <section>
      {/*
        Design-audit fix: section headings were text-sm/muted-foreground —
        far too small/quiet to establish real hierarchy against the
        reference terminal's text-2xl/bold treatment. Bumped up (responsive
        text-xl -> sm:text-2xl so it doesn't dominate on narrow phones), plus
        an optional rounded-square icon badge to match "Market Summary" and
        "Most Active"'s mini chart-icon treatment in the reference.
      */}
      <div className="mb-4 flex items-center gap-2.5">
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
              iconClassName ?? "bg-accent text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{title}</h2>
      </div>

      {error && (
        <p className="hig-card mb-3 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className={cn("grid gap-4", columnsClassName)}>
        {quotes === null
          ? Array.from({ length: slots }).map((_, i) => <IndexCard key={i} />)
          : quotes.map((q) => {
              const tick = ticks?.get(q.symbol);
              return (
                <MarketQuoteCard
                  key={q.symbol}
                  quote={tick?.quote ?? q}
                  showWatchlistToggle={showWatchlistToggle}
                  flash={tick ? { direction: tick.direction, key: tick.flashKey } : undefined}
                />
              );
            })}
      </div>

      {quotes !== null && quotes.length === 0 && !error && (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
