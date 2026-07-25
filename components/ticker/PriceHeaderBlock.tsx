import { formatChange, formatPercent, formatPrice, changeDirection } from "@/lib/format/currency";
import type { MarketQuote } from "@/lib/finance/types";

interface PriceHeaderBlockProps {
  quote: MarketQuote;
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

export function PriceHeaderBlock({ quote }: PriceHeaderBlockProps) {
  const direction = changeDirection(quote.change);
  const colorClass =
    direction === "up" ? "text-success" : direction === "down" ? "text-destructive" : "text-muted-foreground";

  const showPreMarket = quote.marketState === "PRE" && quote.preMarketPrice != null;
  const showPostMarket =
    (quote.marketState === "POST" || quote.marketState === "POSTPOST" || quote.marketState === "CLOSED") &&
    quote.postMarketPrice != null;

  const regularTimestamp = formatTimestamp(quote.asOf, quote.timezone);

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {formatPrice(quote.price, quote.currency)}
        </span>
        <span className={`font-mono text-sm font-semibold sm:text-base ${colorClass}`}>
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
