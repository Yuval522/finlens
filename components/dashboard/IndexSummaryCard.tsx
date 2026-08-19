import type { MarketQuote } from "@/lib/finance/types";
import { changeDirection, formatPercent, toDisplayUnit } from "@/lib/format/currency";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { cn } from "@/lib/utils";

interface IndexSummaryCardProps {
  quote: MarketQuote;
  label: string;
  /** Recent daily closes (oldest first), display-unit already applied — see MarketSummarySection. Omitted/short arrays just skip the sparkline. */
  history?: number[];
}

/**
 * Compact "major index" card for the Home dashboard's Market Summary
 * section (see stox-redesign-concept.html's `.index-card` for the
 * reference this was built against) — label, large mono value, a
 * green/red % pill, and a trend sparkline below it. Deliberately a
 * distinct, simpler shape from MarketQuoteCard (still used for Most
 * Active/Watchlist): no logo/avatar, and not a link — indices aren't a
 * tradeable ticker the way individual stocks are, so there's no
 * per-index analysis page to send it to.
 *
 * Index "values" are levels, not currency amounts you'd trade at, so
 * unlike MarketQuoteCard this intentionally does NOT prefix the value with
 * a currency symbol (formatPrice would render "$5,931.12" / "₪2,184.30")
 * — just the plain formatted number, matching the reference design.
 *
 * Fixed width (rather than the old auto-fit grid cell) — MarketSummarySection
 * now lays these out in a horizontally scrollable row instead of a
 * wrapping grid, so every card needs a stable, non-shrinking size.
 */
export function IndexSummaryCard({ quote, label, history }: IndexSummaryCardProps) {
  const direction = changeDirection(quote.change);
  const value =
    quote.price == null
      ? "—"
      : toDisplayUnit(quote.price, quote.currency).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className="hig-card hig-card-interactive w-[190px] shrink-0 snap-start px-[18px] py-4 sm:w-[210px]">
      <p className="mb-2 truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mb-1.5 font-mono text-[19px] font-semibold tracking-[-0.01em] text-foreground">{value}</p>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[11.5px] font-semibold",
          direction === "flat" && "bg-muted-foreground/10 text-muted-foreground",
          direction === "up" && "bg-success/[0.14] text-success",
          direction === "down" && "bg-destructive/[0.14] text-destructive"
        )}
      >
        {direction === "up" && "↑ "}
        {direction === "down" && "↓ "}
        {formatPercent(quote.changePercent)}
      </span>
      {history && history.length >= 2 && (
        <div className="mt-3">
          <Sparkline values={history} direction={direction} />
        </div>
      )}
    </div>
  );
}
