"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketQuote } from "./types";

export interface LiveQuoteTick {
  quote: MarketQuote;
  /**
   * Direction of the most recent price *tick* — this poll's price vs. the
   * previous poll's price — not the day's cumulative change (that's
   * `quote.change`/`quote.changePercent`, which stays the same sign all
   * day). Drives the green/red flash. "flat" on the very first tick for a
   * symbol (nothing to compare against yet) and on any poll where the
   * price didn't move.
   */
  direction: "up" | "down" | "flat";
  /**
   * Increments only when this symbol's price actually changes between
   * polls. Consuming components key an element on this (e.g.
   * `key={tick.flashKey}`) to force React to mount a fresh DOM node and
   * replay the CSS flash animation — a plain class toggle wouldn't re-fire
   * the animation on two consecutive same-direction ticks, since the
   * className string wouldn't change.
   */
  flashKey: number;
}

export interface UseLiveQuotesOptions {
  /** Poll interval while the tab is visible, in ms. Default 7000 — the midpoint of the requested 5-10s live-feed cadence. */
  intervalMs?: number;
  enabled?: boolean;
}

export interface UseLiveQuotesResult {
  /** Per-symbol live quote + tick direction/flash key. */
  ticks: Map<string, LiveQuoteTick>;
  /** True once at least one poll has resolved (success or failure) for the current symbol set — lets a page show a loading skeleton only until the very first response, same as the old fetch-on-mount pattern it replaces. */
  hasLoadedOnce: boolean;
  /** Message from the most recent failed poll; cleared on the next successful one. Best-effort — a transient failure doesn't clear already-loaded ticks, it just surfaces a banner alongside the last-known prices. */
  error: string | null;
}

/**
 * Trading-terminal-style live quote feed: polls /api/quotes for a set of
 * symbols on a short interval, tracks per-symbol tick direction for flash
 * animations, and pauses entirely while the browser tab is hidden (Page
 * Visibility API) — resuming with an immediate catch-up refetch the instant
 * the tab becomes visible again, so a background tab doesn't burn API quota
 * for prices nobody's looking at, and the price is never more than one
 * interval stale whenever it actually is on screen.
 *
 * Distinct from useBackgroundRefresh (a generic focus/visibility-triggered
 * refetch *trigger* used for slower-moving fundamentals data elsewhere in
 * the app): this owns its own fetch-and-diff loop end to end and is
 * purpose-built for price-ticker UIs, since it also needs to remember the
 * previous poll's price per symbol to know which way each one just moved.
 *
 * Every request goes through the same /api/quotes route (backed by
 * getQuotes()'s 20s TtlCache in yahoo.ts — see that file), so multiple
 * components polling overlapping symbol sets at slightly different times
 * still mostly hit the shared cache rather than each firing an independent
 * upstream Yahoo call.
 */
export function useLiveQuotes(
  symbols: string[],
  { intervalMs = 7000, enabled = true }: UseLiveQuotesOptions = {}
): UseLiveQuotesResult {
  const symbolsKey = symbols.join(",");
  const [ticks, setTicks] = useState<Map<string, LiveQuoteTick>>(new Map());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flashCounterRef = useRef(0);

  useEffect(() => {
    // No symbols to track — nothing to poll, and nothing "loading" either
    // (an empty watchlist shouldn't show a loading skeleton forever).
    if (!enabled || symbolsKey === "") {
      setHasLoadedOnce(true);
      return;
    }
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      try {
        // Mobile state-sync fix: cache: "no-store" — see
        // lib/portfolio/store.ts's refreshLivePrices identical comment.
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbolsKey)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Unable to load live quotes");
          setHasLoadedOnce(true);
          return;
        }

        const quotes: MarketQuote[] = Array.isArray(data.quotes) ? data.quotes : [];
        setError(null);
        setHasLoadedOnce(true);
        if (quotes.length === 0) return;

        setTicks((prev) => {
          const next = new Map(prev);
          for (const quote of quotes) {
            if (quote.price == null) continue;
            const prior = next.get(quote.symbol);
            const priorPrice = prior?.quote.price ?? null;
            let direction: "up" | "down" | "flat" = "flat";
            let flashKey = prior?.flashKey ?? 0;
            if (priorPrice != null && quote.price !== priorPrice) {
              direction = quote.price > priorPrice ? "up" : "down";
              flashKey = ++flashCounterRef.current;
            }
            next.set(quote.symbol, { quote, direction, flashKey });
          }
          return next;
        });
      } catch {
        // Network failure (offline, blocked) — surface it but keep whatever
        // ticks are already on screen; the next poll (or the resume-on-
        // visible catch-up) will clear the error if it succeeds.
        if (!cancelled) {
          setError("Unable to load live quotes");
          setHasLoadedOnce(true);
        }
      }
    }

    function stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = undefined;
    }
    function start() {
      stop();
      intervalId = setInterval(poll, intervalMs);
    }
    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else {
        poll();
        start();
      }
    }

    poll();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // symbolsKey (not `symbols`, a new array identity every render) is the
    // real dependency here — same convention as WatchlistPage's fetchQuotes
    // effect used before this hook replaced it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, intervalMs, enabled]);

  return { ticks, hasLoadedOnce, error };
}
