"use client";

import { useMemo } from "react";
import type { MarketQuote } from "@/lib/finance/types";
import { useLiveQuotes } from "@/lib/finance/useLiveQuotes";
import { PriceHeaderBlock } from "./PriceHeaderBlock";

interface LivePriceHeaderProps {
  symbol: string;
  initialQuote: MarketQuote;
}

/**
 * Client wrapper around PriceHeaderBlock (kept a plain presentational
 * component — no fetching logic of its own) that keeps the displayed quote
 * live while the ticker page stays open.
 *
 * Seeded with the server-rendered quote from the initial page load (see
 * analysis/[symbol]/page.tsx) so there's no loading flash on navigation.
 * useLiveQuotes then polls /api/quotes — the same route, backed by the same
 * fast 20s-cached getQuotes() path the dashboard and watchlist already use
 * (see the getFundamentals() quote-decoupling fix in yahoo.ts) — every ~7s
 * while the tab is visible (auto-pausing while it isn't), and reports which
 * way the price just ticked so PriceHeaderBlock can flash it green/red.
 */
export function LivePriceHeader({ symbol, initialQuote }: LivePriceHeaderProps) {
  const symbols = useMemo(() => [symbol], [symbol]);
  const { ticks } = useLiveQuotes(symbols, { intervalMs: 7000 });
  const tick = ticks.get(symbol);
  const quote = tick?.quote ?? initialQuote;

  return (
    <PriceHeaderBlock
      quote={quote}
      flash={tick ? { direction: tick.direction, key: tick.flashKey } : undefined}
    />
  );
}
