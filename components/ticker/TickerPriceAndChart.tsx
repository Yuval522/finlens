"use client";

import { useMemo } from "react";
import type { MarketQuote, PricePoint } from "@/lib/finance/types";
import { useLiveQuotes } from "@/lib/finance/useLiveQuotes";
import { PriceHeaderBlock } from "./PriceHeaderBlock";
import { ChartPanel } from "./ChartPanel";

interface TickerPriceAndChartProps {
  initialQuote: MarketQuote;
  history: PricePoint[];
  exchange: string | null;
}

/**
 * Live price/chart desync bug fix (systemic, live report: the price header
 * ticks live every ~7s while the chart's top-left "current price" label
 * stayed frozen at the page's one-time server-rendered value). Root cause:
 * this used to be two entirely separate components — LivePriceHeader (owns
 * its own useLiveQuotes poll) and ChartPanel (fed a `currentPrice` prop
 * straight from the server component's initial `quote`, never refreshed) —
 * with no shared state between them, so they inevitably drifted apart the
 * moment the header's first live poll landed.
 *
 * This component is now the single owner of the live quote for this
 * symbol: ONE useLiveQuotes call, whose result feeds both PriceHeaderBlock
 * and ChartPanel's `currentPrice` on the exact same render — the header and
 * the chart's price label can never show two different values again, and
 * there's no risk of two independent poll timers landing at different
 * offsets either (a subtler version of the same bug a naive "give
 * ChartPanel its own useLiveQuotes call too" fix would have left in place).
 */
export function TickerPriceAndChart({ initialQuote, history, exchange }: TickerPriceAndChartProps) {
  const symbols = useMemo(() => [initialQuote.symbol], [initialQuote.symbol]);
  const { ticks } = useLiveQuotes(symbols, { intervalMs: 7000 });
  const tick = ticks.get(initialQuote.symbol);
  const quote = tick?.quote ?? initialQuote;

  return (
    <>
      <PriceHeaderBlock quote={quote} flash={tick ? { direction: tick.direction, key: tick.flashKey } : undefined} />
      <ChartPanel
        history={history}
        currency={quote.currency}
        symbol={quote.symbol}
        exchange={exchange}
        currentPrice={quote.price}
      />
    </>
  );
}
