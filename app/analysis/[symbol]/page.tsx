import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { getQuotes } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";
import {
  changeDirection,
  formatChange,
  formatPercent,
  formatPrice,
} from "@/lib/format/currency";
import { cn } from "@/lib/utils";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = decodeURIComponent(rawSymbol);

  let quote = null;
  let error: string | null = null;
  try {
    const [q] = await getQuotes([symbol]);
    quote = q ?? null;
  } catch (err) {
    error =
      err instanceof MarketDataError
        ? err.message
        : "Unable to load this symbol right now";
  }

  if (error || !quote) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <h1 className="font-mono text-lg font-semibold">{symbol}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error ?? "No data found for this symbol."}
        </p>
      </div>
    );
  }

  const direction = changeDirection(quote.change);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono text-sm text-muted-foreground">
            {quote.symbol} · {quote.exchange}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {quote.name}
          </h1>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-mono text-3xl font-semibold tracking-tight">
            {formatPrice(quote.price, quote.currency)}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 font-mono text-sm font-medium sm:justify-end",
              direction === "up" && "text-success",
              direction === "down" && "text-destructive",
              direction === "flat" && "text-muted-foreground"
            )}
          >
            {direction === "up" && <ArrowUp className="h-3.5 w-3.5" />}
            {direction === "down" && <ArrowDown className="h-3.5 w-3.5" />}
            {direction === "flat" && <Minus className="h-3.5 w-3.5" />}
            {formatChange(quote.change, quote.currency)} (
            {formatPercent(quote.changePercent)})
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Full charting, fundamentals, and technical indicators for{" "}
          <span className="font-mono">{quote.symbol}</span> are coming in a
          later build phase.
        </p>
      </div>
    </div>
  );
}
