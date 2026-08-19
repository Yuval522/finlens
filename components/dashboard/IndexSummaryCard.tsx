import Link from "next/link";
import { Minus } from "lucide-react";
import type { MarketQuote } from "@/lib/finance/types";
import { changeDirection, formatPercent, toDisplayUnit } from "@/lib/format/currency";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Led } from "@/components/shared/Led";
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
 * Active/Watchlist): no logo/avatar.
 *
 * Index "values" are levels, not currency amounts you'd trade at, so
 * unlike MarketQuoteCard this intentionally does NOT prefix the value with
 * a currency symbol (formatPrice would render "$5,931.12" / "₪2,184.30")
 * — just the plain formatted number, matching the reference design.
 *
 * Fixed width (rather than the old auto-fit grid cell) — MarketSummarySection
 * now lays these out in a horizontally scrollable row instead of a
 * wrapping grid, so every card needs a stable, non-shrinking size.
 *
 * Top-right pulsing LED status dot matches the exact treatment
 * MarketQuoteCard already uses for Most Active/Watchlist — same Led
 * component, same flat/up/down badge logic — so "live-looking" status
 * indicators read consistently across every card type on the dashboard.
 *
 * QA fix: clicking a card previously did nothing — indices had no
 * per-symbol destination. Now a Link to /analysis/[symbol], same as
 * MarketQuoteCard, reusing the already-built Analysis page rather than a
 * new modal: it already renders price + chart for any symbol and already
 * has an explicit graceful path for index-type quotes specifically (see
 * NonFundamentalNotice, shown in place of the fundamentals tabs for
 * indices/ETFs/crypto/etc.), so this "just works" without new UI. `block`
 * is required here — an <a> is inline by default, which would otherwise
 * break this card's explicit width/padding/shrink-0 sizing.
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
    <Link
      href={`/analysis/${encodeURIComponent(quote.symbol)}`}
      className="hig-card hig-card-interactive relative block w-[190px] shrink-0 snap-start px-[18px] py-4 sm:w-[210px]"
    >
      <span
        className={cn(
          "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full",
          direction === "up" && "bg-success/10",
          direction === "down" && "bg-destructive/10",
          direction === "flat" && "bg-accent text-muted-foreground"
        )}
        aria-hidden="true"
      >
        {direction === "flat" ? <Minus className="h-3.5 w-3.5" /> : <Led up={direction === "up"} />}
      </span>
      <p className="mb-2 truncate pr-7 text-xs font-medium text-muted-foreground">{label}</p>
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
    </Link>
  );
}
