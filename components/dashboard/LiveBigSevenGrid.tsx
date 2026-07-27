"use client";

import { Crown } from "lucide-react";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { useLiveQuotes } from "@/lib/finance/useLiveQuotes";
import type { MarketQuote } from "@/lib/finance/types";

interface LiveBigSevenGridProps {
  symbols: string[];
  initialQuotes: MarketQuote[];
}

const ICON_CLASS = "bg-violet-500/15 text-violet-400";
// Same auto-fit/minmax treatment as Market Summary/Most Active — see
// QuoteCardGrid's doc comment for the 300px-floor sizing rationale.
const COLUMNS = "grid-cols-[repeat(auto-fit,minmax(300px,1fr))]";

/**
 * Client-side Live Trading Feed overlay for the Big 7 section — seeded with
 * the server-rendered quotes from BigSevenSection (no loading flash on
 * first paint), then kept live via useLiveQuotes' ~7s poll while the tab is
 * visible, with each card flashing green/red on an actual tick. Same
 * pattern LivePriceHeader uses for the ticker page's price.
 */
export function LiveBigSevenGrid({ symbols, initialQuotes }: LiveBigSevenGridProps) {
  const { ticks } = useLiveQuotes(symbols, { intervalMs: 7000 });

  return (
    <QuoteCardGrid
      title="Big 7"
      quotes={initialQuotes}
      slots={symbols.length}
      columnsClassName={COLUMNS}
      icon={Crown}
      iconClassName={ICON_CLASS}
      ticks={ticks}
    />
  );
}
