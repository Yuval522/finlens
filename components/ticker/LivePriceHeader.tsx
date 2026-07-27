"use client";

import { useCallback, useState } from "react";
import type { MarketQuote } from "@/lib/finance/types";
import { useBackgroundRefresh } from "@/lib/finance/useBackgroundRefresh";
import { PriceHeaderBlock } from "./PriceHeaderBlock";

interface LivePriceHeaderProps {
  symbol: string;
  initialQuote: MarketQuote;
}

/**
 * Client wrapper around PriceHeaderBlock (kept a plain presentational
 * component — no fetching logic of its own) that keeps the displayed
 * quote live while the ticker page stays open.
 *
 * Seeded with the server-rendered quote from the initial page load (see
 * analysis/[symbol]/page.tsx) so there's no loading flash on navigation.
 * useBackgroundRefresh then re-fetches from /api/quotes — the same route,
 * backed by the same fast 20s-cached getQuotes() path the dashboard and
 * watchlist already use (see the getFundamentals() quote-decoupling fix
 * in yahoo.ts) — on window focus, tab visibility, and a gentle 30s
 * interval. A user who leaves this tab open now sees the price actually
 * move instead of it freezing at whatever it was on page load.
 */
export function LivePriceHeader({ symbol, initialQuote }: LivePriceHeaderProps) {
  const [quote, setQuote] = useState<MarketQuote>(initialQuote);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`);
      if (!res.ok) return;
      const data = await res.json();
      const next: MarketQuote | undefined = Array.isArray(data.quotes) ? data.quotes[0] : undefined;
      if (next && next.price != null) setQuote(next);
    } catch {
      // Best-effort background refresh — keep showing the last known quote
      // rather than surfacing a transient network error in the UI.
    }
  }, [symbol]);

  useBackgroundRefresh(refresh, { intervalMs: 30_000 });

  return <PriceHeaderBlock quote={quote} />;
}
