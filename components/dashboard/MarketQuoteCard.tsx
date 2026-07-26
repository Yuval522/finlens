import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { MarketQuote } from "@/lib/finance/types";
import {
  changeDirection,
  formatPercent,
  formatPrice,
} from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "./CompanyLogo";
import { WatchlistButton } from "@/components/shared/WatchlistButton";

interface MarketQuoteCardProps {
  quote: MarketQuote;
  /** Opt-in — the /watchlist page needs a remove affordance on every card; Market Summary/Most Active don't ask for one. */
  showWatchlistToggle?: boolean;
}

const DIRECTION_GLYPH = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/**
 * QA polish pass ("density gap vs iCharts" audit): more internal padding
 * (p-4 -> p-5), a bumped/bolder price figure, and the trend arrow moved out
 * of the inline price/change text into its own small top-right badge glyph
 * — matching the reference terminal's "top-right trend glyph instead of
 * inline arrow+percent text" treatment, and giving the card real
 * whitespace/typographic hierarchy instead of packing everything into one
 * tight row.
 */
export function MarketQuoteCard({ quote, showWatchlistToggle = false }: MarketQuoteCardProps) {
  const direction = changeDirection(quote.change);
  const DirectionIcon = DIRECTION_GLYPH[direction];

  return (
    <Link
      href={`/analysis/${encodeURIComponent(quote.symbol)}`}
      // Design-audit fix: reference cards lift + scale slightly on hover;
      // FinLens's had no hover micro-interaction at all. .glass-card's own
      // CSS already declares a `transition: border-color, box-shadow`
      // shorthand for its built-in cyan-glow hover — re-declaring the full
      // property list here (rather than adding a separate `transition-
      // transform` utility) keeps all three animating together instead of
      // a bare `transition-property` override silently dropping the other
      // two mid-cascade.
      className="glass-card relative flex items-center gap-3 rounded-lg p-5 transition-[transform,border-color,box-shadow] duration-200 hover:scale-[1.02] hover:shadow-lg"
    >
      <div className="absolute right-3 top-3 flex items-center gap-1">
        {showWatchlistToggle && <WatchlistButton symbol={quote.symbol} size={15} />}
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full",
            direction === "up" && "bg-success/10 text-success",
            direction === "down" && "bg-destructive/10 text-destructive",
            direction === "flat" && "bg-accent text-muted-foreground"
          )}
          aria-hidden="true"
        >
          <DirectionIcon className="h-3.5 w-3.5" />
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
        QA fix (price/badge collision): the absolute top-right trend badge
        (h-6 w-6 circle at right-3/top-3, so it spans roughly 12-36px in
        from the card's right edge) overlaps the price block, which — being
        the last flex child, right-aligned via items-end — otherwise renders
        flush with the card's own padding edge (only 20px in). Long price
        strings like "₪4,173.88" run right under the badge. pr-6 (24px)
        pushes the price block's right edge in past the badge's left edge
        with a small visible gap; pt-0.5 gives the top price line a little
        extra clearance from the badge's vertical band too, since the row
        is vertically centered and can otherwise start almost level with it.
      */}
      <div className="flex shrink-0 flex-col items-end gap-0.5 pr-6 pt-0.5">
        <p className="font-mono text-base font-bold text-foreground">
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
