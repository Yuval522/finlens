"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/store";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { useBackgroundRefresh } from "@/lib/finance/useBackgroundRefresh";
import type { MarketQuote } from "@/lib/finance/types";

/**
 * Client component (not the usual server-fetched dashboard pattern) — the
 * watchlist itself lives in localStorage (see lib/watchlist/store.ts), so
 * there's nothing to fetch server-side until we already know which symbols
 * the user starred. Quotes for those symbols are then fetched client-side
 * from the existing /api/quotes route, same one the rest of the dashboard
 * already uses.
 */
export default function WatchlistPage() {
  const { symbols } = useWatchlist();
  const [quotes, setQuotes] = useState<MarketQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const symbolsKey = symbols.join(",");

  // "Latest request wins" guard — now that both the symbols-changed effect
  // AND the background refresh below can trigger a fetch, a slow earlier
  // response landing after a newer one would otherwise briefly show stale
  // data (or clobber fresher data that already arrived).
  const requestIdRef = useRef(0);

  /**
   * `showLoading` clears the grid to its loading (null) state first — used
   * when the symbol list itself changes (a star/unstar), matching the
   * original behavior. Background refreshes (focus/visibility/interval,
   * via useBackgroundRefresh below) instead update quietly in place,
   * keeping last-known quotes on screen instead of flashing back to
   * loading every 60s while the user just has this tab open.
   */
  const fetchQuotes = useCallback(
    async (showLoading: boolean) => {
      if (symbols.length === 0) {
        setQuotes([]);
        setError(null);
        return;
      }
      const requestId = ++requestIdRef.current;
      if (showLoading) setQuotes(null);
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbolsKey)}`);
        const data = await res.json();
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        if (!res.ok) {
          setError(data.error ?? "Unable to load your watchlist quotes");
          if (showLoading) setQuotes([]);
          return;
        }
        setError(null);
        setQuotes(data.quotes ?? []);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError("Unable to load your watchlist quotes");
        if (showLoading) setQuotes([]);
      }
    },
    [symbols.length, symbolsKey]
  );

  useEffect(() => {
    fetchQuotes(true);
    // fetchQuotes' own deps (symbols.length/symbolsKey) already capture
    // everything relevant to re-running this — re-listing them here would
    // just duplicate the array-vs-string dependency, not add safety.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // Freshness fix ("prices go stale if you leave the tab open"): quotes
  // used to only ever be fetched once per symbol-list change — leaving
  // this page open showed the same prices indefinitely. Re-fetches quietly
  // on window focus, tab visibility, and a gentle 60s interval; see
  // useBackgroundRefresh's doc comment.
  useBackgroundRefresh(() => fetchQuotes(false), { intervalMs: 60_000, enabled: symbols.length > 0 });

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
    />
  );
}
