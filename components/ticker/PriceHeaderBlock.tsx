import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatChange, formatPercent, formatPrice, changeDirection } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { MarketQuote } from "@/lib/finance/types";

interface PriceHeaderBlockProps {
  quote: MarketQuote;
}

const DIRECTION_GLYPH = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

function formatTimestamp(asOf: number | null, timezone: string | null): string | null {
  if (asOf == null) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
      timeZoneName: "short",
    }).format(new Date(asOf));
  } catch {
    return null;
  }
}

export function PriceHeaderBlock({ quote }: PriceHeaderBlockProps) {
  const direction = changeDirection(quote.change);
  const DirectionIcon = DIRECTION_GLYPH[direction];

  const showPreMarket = quote.marketState === "PRE" && quote.preMarketPrice != null;
  const showPostMarket =
    (quote.marketState === "POST" || quote.marketState === "POSTPOST" || quote.marketState === "CLOSED") &&
    quote.postMarketPrice != null;

  const regularTimestamp = formatTimestamp(quote.asOf, quote.timezone);

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      {/*
        QA fix: the big price figure and the change/percent text used to sit
        directly adjacent with no visual boundary between them (baseline-
        aligned, no background) — at the reported viewport this crowded
        together as more of a wall of text than two distinct pieces of
        information. The change/percent now live in their own tinted,
        padded chip (background + rounded corners + a direction glyph),
        giving it a real edge to separate it from the price instead of just
        a text gap, and items-center (rather than items-baseline) keeps the
        chip vertically centered against the much taller price digits.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {formatPrice(quote.price, quote.currency)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold sm:text-base",
            direction === "up" && "bg-success/10 text-success",
            direction === "down" && "bg-destructive/10 text-destructive",
            direction === "flat" && "bg-accent text-muted-foreground"
          )}
        >
          <DirectionIcon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
          {formatChange(quote.change, quote.currency)} ({formatPercent(quote.changePercent)})
        </span>
        {regularTimestamp && (
          <span className="text-xs text-muted-foreground">as of {regularTimestamp}</span>
        )}
      </div>

      {showPreMarket && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-slate-800/80 pt-2 text-xs">
          <span className="text-muted-foreground">Pre-Market:</span>
          <span className="font-mono font-medium text-foreground">
            {formatPrice(quote.preMarketPrice, quote.currency)}
          </span>
          <span
            className={`font-mono ${
              changeDirection(quote.preMarketChange) === "up"
                ? "text-success"
                : changeDirection(quote.preMarketChange) === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {formatChange(quote.preMarketChange, quote.currency)} (
            {formatPercent(quote.preMarketChangePercent)})
          </span>
          {formatTimestamp(quote.asOf, quote.timezone) && (
            <span className="text-muted-foreground">
              · {formatTimestamp(quote.asOf, quote.timezone)}
            </span>
          )}
        </div>
      )}

      {showPostMarket && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-slate-800/80 pt-2 text-xs">
          <span className="text-muted-foreground">After Hours:</span>
          <span className="font-mono font-medium text-foreground">
            {formatPrice(quote.postMarketPrice, quote.currency)}
          </span>
          <span
            className={`font-mono ${
              changeDirection(quote.postMarketChange) === "up"
                ? "text-success"
                : changeDirection(quote.postMarketChange) === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {formatChange(quote.postMarketChange, quote.currency)} (
            {formatPercent(quote.postMarketChangePercent)})
          </span>
          {formatTimestamp(quote.asOf, quote.timezone) && (
            <span className="text-muted-foreground">
              · {formatTimestamp(quote.asOf, quote.timezone)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
