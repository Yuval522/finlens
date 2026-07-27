"use client";

import { Star } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/store";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { useLiveQuotes } from "@/lib/finance/useLiveQuotes";
import type { MarketQuote } from "@/lib/finance/types";

/**
 * Client component (not the usual server-fetched dashboard pattern) — the
 * watchlist itself lives in localStorage (see lib/watchlist/store.ts), so
 * there's nothing to fetch server-side until we already know which symbols
 * the user starred.
 *
 * Live Trading Feed: useLiveQuotes owns the whole fetch/poll/flash loop —
 * quotes for starred symbols refresh every ~7s while this tab is visible
 * (auto-pausing while it isn't), and each card flashes green/red the moment
 * its price actually ticks. This replaced a bespoke fetchQuotes +
 * useBackgroundRefresh combo that only re-fetched on a 60s interval/focus
 * and had no per-symbol tick tracking.
 */
export default function WatchlistPage() {
  const { symbols } = useWatchlist();
  const { ticks, hasLoadedOnce, error } = useLiveQuotes(symbols, { intervalMs: 7000, enabled: symbols.length > 0 });

  // Preserve the user's starred order (watchlist star order), not whatever
  // order the API happens to return — same as the original fetchQuotes
  // implementation's intent, made explicit now that ticks is keyed by symbol.
  const quotes: MarketQuote[] | null = hasLoadedOnce
    ? symbols.map((s) => ticks.get(s)?.quote).filter((q): q is MarketQuote => Boolean(q))
    : null;

  if (symbols.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl !border-dashed py-24 text-center">
        <Star className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Your watchlist is empty</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Star a stock from its ticker page or from a search result to track it here.
        </p>
      </div>
    );
  }

  return (
    <QuoteCardGrid
      title="Watchlist"
      quotes={quotes}
      slots={symbols.length}
      error={error}
      showWatchlistToggle
      emptyMessage="Couldn't load quotes for your watchlist symbols right now."
      icon={Star}
      iconClassName="bg-amber-500/15 text-amber-400"
      ticks={ticks}
    />
  );
}
