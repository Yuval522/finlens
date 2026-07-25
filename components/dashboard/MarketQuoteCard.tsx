import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { MarketQuote } from "@/lib/finance/types";
import {
  changeDirection,
  formatPercent,
  formatPrice,
} from "@/lib/format/currency";
import { cn } from "@/lib/utils";

export function MarketQuoteCard({ quote }: { quote: MarketQuote }) {
  const direction = changeDirection(quote.change);
  const initial = quote.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Link
      href={`/analysis/${encodeURIComponent(quote.symbol)}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {quote.name}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {quote.symbol}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <p className="font-mono text-sm font-semibold text-foreground">
          {formatPrice(quote.price, quote.currency)}
        </p>
        <p
          className={cn(
            "flex items-center gap-0.5 font-mono text-xs font-medium",
            direction === "up" && "text-success",
            direction === "down" && "text-destructive",
            direction === "flat" && "text-muted-foreground"
          )}
        >
          {direction === "up" && <ArrowUp className="h-3 w-3" />}
          {direction === "down" && <ArrowDown className="h-3 w-3" />}
          {direction === "flat" && <Minus className="h-3 w-3" />}
          {formatPercent(quote.changePercent)}
        </p>
      </div>
    </Link>
  );
}
