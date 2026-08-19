import { Minus } from "lucide-react";
import { formatChange, formatPercent, formatPrice, changeDirection } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { MarketQuote } from "@/lib/finance/types";
import { Led } from "@/components/shared/Led";

interface PriceHeaderBlockProps {
  quote: MarketQuote;
  /**
   * Live Trading Feed tick (see useLiveQuotes) — when present, the main
   * price briefly flashes green/red on an actual poll-to-poll price
   * movement. Omitted on static/non-live render paths (e.g. server-only
   * previews), which simply show no flash.
   */
  flash?: { direction: "up" | "down" | "flat"; key: number };
}

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

export function PriceHeaderBlock({ quote, flash }: PriceHeaderBlockProps) {
  const direction = changeDirection(quote.change);

  const showPreMarket = quote.marketState === "PRE" && quote.preMarketPrice != null;
  const showPostMarket =
    (quote.marketState === "POST" || quote.marketState === "POSTPOST" || quote.marketState === "CLOSED") &&
    quote.postMarketPrice != null;

  const regularTimestamp = formatTimestamp(quote.asOf, quote.timezone);

  const priceFlashClass =
    flash?.direction === "up" ? "price-flash-up" : flash?.direction === "down" ? "price-flash-down" : undefined;

  const showDayRange = quote.dayOpen != null || quote.dayHigh != null || quote.dayLow != null || quote.previousClose != null;
  const DAY_RANGE_FIELDS: { label: string; value: number | null }[] = [
    { label: "Open", value: quote.dayOpen },
    { label: "Day High", value: quote.dayHigh },
    { label: "Day Low", value: quote.dayLow },
    { label: "Prev Close", value: quote.previousClose },
  ];

  return (
    <div className="hig-card p-4 sm:p-5">
      {/*
        QA fix (round 2): the previous single-row flex-wrap layout still let
        the price and the change/percent chip crowd together at narrower
        widths flagged in the latest screenshot ($9.10 / -6.47%) — flex-wrap
        only breaks onto a new line once it runs out of horizontal room, so
        right up until that point the two sit pressed against each other
        with just a small gap. Switched to an explicit vertical stack (flex
        flex-col items-start) so the price and the change/percent chip are
        ALWAYS on their own separate rows regardless of viewport width or
        string length, not just when wrapping happens to kick in.
      */}
      <div className="flex flex-col items-start gap-1">
        <span
          key={flash?.key ?? 0}
          className={cn(
            "font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl",
            priceFlashClass
          )}
        >
          {formatPrice(quote.price, quote.currency)}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold sm:text-base",
              direction === "up" && "bg-success/10 text-success",
              direction === "down" && "bg-destructive/10 text-destructive",
              direction === "flat" && "bg-accent text-muted-foreground"
            )}
          >
            {direction === "flat" ? (
              <Minus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            ) : (
              <Led up={direction === "up"} />
            )}
            {formatChange(quote.change, quote.currency)} ({formatPercent(quote.changePercent)})
          </span>
          {regularTimestamp && (
            <span className="text-xs text-muted-foreground">as of {regularTimestamp}</span>
          )}
        </div>
      </div>

      {showPreMarket && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-foreground/8 pt-2 text-xs">
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
          {/* Pre-market timestamp bug fix: this used to reuse `quote.asOf`
              (the REGULAR session's last-trade time — see preMarketTime's
              doc comment in lib/finance/types.ts), which before the market
              opens is always the prior day's ~4:00pm close, making every
              pre-market quote look frozen at yesterday's close regardless
              of how current the pre-market price itself actually was.
              `preMarketTime` is Yahoo's own dedicated pre-market
              last-updated timestamp. */}
          {formatTimestamp(quote.preMarketTime, quote.timezone) && (
            <span className="text-muted-foreground">
              · {formatTimestamp(quote.preMarketTime, quote.timezone)}
            </span>
          )}
        </div>
      )}

      {showPostMarket && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-foreground/8 pt-2 text-xs">
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
          {/* Same fix as the pre-market row above, using Yahoo's dedicated
              post-market last-updated timestamp instead of the regular
              session's `asOf`. */}
          {formatTimestamp(quote.postMarketTime, quote.timezone) && (
            <span className="text-muted-foreground">
              · {formatTimestamp(quote.postMarketTime, quote.timezone)}
            </span>
          )}
        </div>
      )}

      {showDayRange && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-foreground/8 pt-2 text-xs sm:grid-cols-4">
          {DAY_RANGE_FIELDS.map((field) => (
            <div key={field.label} className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
              <span className="text-muted-foreground">{field.label}</span>
              <span className="font-mono font-medium text-foreground">
                {formatPrice(field.value, quote.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
