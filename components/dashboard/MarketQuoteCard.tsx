import Link from "next/link";
import { Minus } from "lucide-react";
import type { MarketQuote } from "@/lib/finance/types";
import {
  changeDirection,
  formatPercent,
  formatPrice,
} from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "./CompanyLogo";
import { WatchlistButton } from "@/components/shared/WatchlistButton";
import { Led } from "@/components/shared/Led";

interface MarketQuoteCardProps {
  quote: MarketQuote;
  /** Opt-in — the /watchlist page needs a remove affordance on every card; Market Summary/Most Active don't ask for one. */
  showWatchlistToggle?: boolean;
  /** Live Trading Feed tick (see useLiveQuotes) — flashes the price green/red on an actual poll-to-poll move. Omitted on sections that don't poll live (kept optional so existing call sites need no change). */
  flash?: { direction: "up" | "down" | "flat"; key: number };
}

/**
 * QA polish pass ("density gap vs iCharts" audit): more internal padding
 * (p-4 -> p-5), a bumped/bolder price figure, and the trend arrow moved out
 * of the inline price/change text into its own small top-right badge glyph
 * — matching the reference terminal's "top-right trend glyph instead of
 * inline arrow+percent text" treatment, and giving the card real
 * whitespace/typographic hierarchy instead of packing everything into one
 * tight row.
 *
 * Retro-Digital redesign: that top-right badge now shows a blinking LED
 * dot (see components/shared/Led.tsx) instead of an ArrowUp/ArrowDown
 * glyph for up/down; "flat" (no change) still shows a plain Minus glyph,
 * since a static LED wouldn't communicate "no data / unchanged" well.
 */
export function MarketQuoteCard({ quote, showWatchlistToggle = false, flash }: MarketQuoteCardProps) {
  const direction = changeDirection(quote.change);
  const priceFlashClass =
    flash?.direction === "up" ? "price-flash-up" : flash?.direction === "down" ? "price-flash-down" : undefined;

  return (
    <Link
      href={`/analysis/${encodeURIComponent(quote.symbol)}`}
      // Design-audit fix: reference cards lift + scale slightly on hover;
      // Stox's had no hover micro-interaction at all. .glass-card's own
      // CSS already declares a `transition: border-color, box-shadow`
      // shorthand for its built-in cyan-glow hover — re-declaring the full
      // property list here (rather than adding a separate `transition-
      // transform` utility) keeps all three animating together instead of
      // a bare `transition-property` override silently dropping the other
      // two mid-cascade.
      className="glass-card relative flex items-center gap-3 rounded-lg p-5 transition-[transform,border-color,box-shadow] duration-200 hover:scale-[1.02] hover:shadow-lg"
    >
      {/*
        QA fix (screenshot report: watchlist star and the trend-direction
        badge crowd together / nearly touch in the top-right corner). The
        two were gap-1 (4px) apart, and the star's own clickable hit target
        (WatchlistButton's p-1.5) visually reads as part of the star glyph,
        so 4px of true whitespace between two circular shapes read as
        almost none. Widened to gap-2.5 for a clearly visible gap, and gave
        the star its own faint pill background (bg-accent/40) so it reads
        as a distinct control rather than a shape floating right next to
        the trend badge's own colored pill.
      */}
      <div className="absolute right-3 top-3 flex items-center gap-2.5">
        {showWatchlistToggle && (
          <WatchlistButton symbol={quote.symbol} size={15} className="rounded-full bg-accent/40 hover:bg-accent" />
        )}
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full",
            direction === "up" && "bg-success/10",
            direction === "down" && "bg-destructive/10",
            direction === "flat" && "bg-accent text-muted-foreground"
          )}
          aria-hidden="true"
        >
          {direction === "flat" ? <Minus className="h-3.5 w-3.5" /> : <Led up={direction === "up"} />}
        </span>
      </div>

      <CompanyLogo symbol={quote.symbol} name={quote.name} size={40} />
      <div className="min-w-0 flex-1 pr-7">
        <p className="truncate text-sm font-medium text-foreground">
          {quote.name}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {quote.symbol}
        </p>
      </div>
      {/*
        QA fix (price/badge collision, re-broken by the star/badge gap fix
        above): pr-6 (24px) was tuned to clear only the plain trend-badge
        cluster (~36px inset from the card edge when showWatchlistToggle is
        off). Widening that cluster's own internal gap to clear the star
        from the badge pushed its total footprint out to ~73px inset when
        the star IS shown (right-3/12px + WatchlistButton's ~27px box +
        gap-2.5/10px + the 24px badge) — comfortably past pr-6's 44px text
        clearance, so the price digits started rendering right under the
        star. pr-16 (64px, -> ~84px total inset) clears that wider cluster
        with real margin; cards without the toggle (Market Summary/Most
        Active) never had this problem and keep the tighter pr-6.
      */}
      <div className={cn("flex shrink-0 flex-col items-end gap-0.5 pt-0.5", showWatchlistToggle ? "pr-16" : "pr-6")}>
        <p key={flash?.key ?? 0} className={cn("font-mono text-base font-bold text-foreground", priceFlashClass)}>
          {formatPrice(quote.price, quote.currency)}
        </p>
        <p
          className={cn(
            "font-mono text-xs font-medium",
            direction === "up" && "text-success",
            direction === "down" && "text-destructive",
            direction === "flat" && "text-muted-foreground"
          )}
        >
          {formatPercent(quote.changePercent)}
        </p>
      </div>
    </Link>
  );
}
