"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/store";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
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

  useEffect(() => {
    if (symbols.length === 0) {
      setQuotes([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setQuotes(null);
    fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Unable to load your watchlist quotes");
          setQuotes([]);
        } else {
          setError(null);
          setQuotes(data.quotes ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load your watchlist quotes");
          setQuotes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbols]);

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
    />
  );
}
