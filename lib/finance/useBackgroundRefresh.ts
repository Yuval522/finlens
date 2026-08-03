"use client";

import { useEffect, useRef } from "react";

export interface UseBackgroundRefreshOptions {
  /** Gentle background poll interval, in ms. Omit/0 to rely on focus/visibility refetch only, no timer. */
  intervalMs?: number;
  /** Set false to disable every listener/timer without unmounting the caller — e.g. while a fullscreen chart modal is open, or the user has no symbols to refresh. */
  enabled?: boolean;
}

/**
 * Keeps data fresh while a tab stays open, without requiring a full page
 * reload — fires `onRefresh` when the window regains focus, when the tab
 * becomes visible again (covers OS-level app/tab switching, which doesn't
 * always fire a `focus` event the way clicking back into the browser
 * does), when the page is restored from the back/forward cache after
 * being backgrounded (common on mobile — app-switching, screen lock, a
 * home-screen relaunch — see handlePageShow below), and optionally on a
 * gentle background interval.
 *
 * Deliberately just a trigger, not a data-fetching hook itself: the
 * dashboard, watchlist, portfolio, and ticker pages each already have
 * their own quote-fetching logic (client fetch to /api/quotes, or a
 * server-rendered value seeded into local state) — this only re-invokes
 * whatever that already is, so freshness behavior stays consistent with
 * how each page already loads its data the first time. `onRefresh` is
 * read through a ref, not a dependency, so callers don't need to
 * useCallback it to avoid this effect re-subscribing on every render.
 *
 * "Gentle": every refresh path here (focus, visibility, interval) ends up
 * calling the same server route those pages already use, and that route
 * is backed by an in-memory TTL cache (getQuotes()'s 20s quoteCache — see
 * yahoo.ts) — so rapid focus/blur churn (e.g. quickly alt-tabbing) mostly
 * gets served from that cache rather than hammering Yahoo on every event.
 */
export function useBackgroundRefresh(
  onRefresh: () => void,
  { intervalMs, enabled = true }: UseBackgroundRefreshOptions = {}
): void {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    function handleFocus() {
      callbackRef.current();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") callbackRef.current();
    }
    // Mobile state-sync fix: a mobile browser restoring this page from the
    // back/forward cache (bfcache) after backgrounding — switching apps,
    // locking the screen, relaunching from a home-screen icon — doesn't
    // always fire `focus`/`visibilitychange` the way returning to a
    // desktop tab reliably does. `pageshow`'s `persisted` flag is the
    // specific signal a bfcache restore fires, so this is a defensive
    // third net alongside the two above to make sure prices actually
    // refresh on that return trip instead of showing whatever was on
    // screen before backgrounding.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) callbackRef.current();
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (intervalMs && intervalMs > 0) {
      intervalId = setInterval(() => callbackRef.current(), intervalMs);
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalMs, enabled]);
}
