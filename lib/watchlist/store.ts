"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-only watchlist store, persisted to localStorage. Stox has no
 * user accounts/backend database (see project notes — auth/persistence
 * beyond the browser was never part of this build's scope), so "add to
 * watchlist" means "remembered on this browser" rather than synced to a
 * server. Implemented as a module-level Set + useSyncExternalStore rather
 * than React Context, so any component anywhere in the tree (the ticker
 * header star, a search result row, the /watchlist page itself) can read
 * and mutate the same list without a provider wrapping the app.
 */

const STORAGE_KEY = "finlens:watchlist";

let symbols: string[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  symbols = readFromStorage();
  hydrated = true;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // Storage full/unavailable (private browsing, etc.) — the in-memory
    // list still works for the rest of this session, just won't survive
    // a reload. Not worth surfacing to the user for a soft feature.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

/** Exported (not just used internally by useSyncExternalStore) so the
 * multi-user auth sync layer (lib/auth/AuthContext.tsx) can observe every
 * change and debounce-push it to the logged-in user's server row, without
 * every mutator in this file needing to know auth exists. */
export function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  // Cross-tab sync — if the user has two tabs open, toggling in one
  // should reflect in the other.
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) {
      symbols = readFromStorage();
      notify();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string[] {
  ensureHydrated();
  return symbols;
}

const EMPTY: string[] = [];

function getServerSnapshot(): string[] {
  // Empty on the server — the real list only exists in localStorage.
  // useSyncExternalStore reconciles this with the client snapshot on
  // hydration without a mismatch warning, as long as the very first
  // client render also returns this same reference until useEffect-time.
  return EMPTY;
}

export function isWatched(symbol: string): boolean {
  ensureHydrated();
  return symbols.includes(symbol.toUpperCase());
}

export function toggleWatchlist(symbolRaw: string): void {
  ensureHydrated();
  const symbol = symbolRaw.toUpperCase();
  symbols = symbols.includes(symbol) ? symbols.filter((s) => s !== symbol) : [...symbols, symbol];
  persist();
  notify();
}

export function removeFromWatchlist(symbolRaw: string): void {
  ensureHydrated();
  const symbol = symbolRaw.toUpperCase();
  if (!symbols.includes(symbol)) return;
  symbols = symbols.filter((s) => s !== symbol);
  persist();
  notify();
}

/** Current in-memory list, for the auth layer to read at signup-migration
 * time or before a debounced server push — same rationale as
 * lib/portfolio/store.ts's getRawSnapshot(). */
export function getRawSnapshot(): string[] {
  ensureHydrated();
  return symbols;
}

/** Multi-user data isolation: replaces the ENTIRE local list with what the
 * server has for the just-logged-in user (or an empty list if they've
 * never saved one), then persists that to localStorage so a reload keeps
 * showing it. Called by the auth layer right after a successful login —
 * without this, Friend B logging into a browser that still has Friend A's
 * localStorage watchlist would briefly (or permanently, if they never
 * touch the watchlist) see Friend A's symbols. */
export function hydrateFromServer(next: unknown): void {
  symbols = Array.isArray(next) ? next.filter((s): s is string => typeof s === "string") : [];
  hydrated = true;
  persist();
  notify();
}

/** Clears the list back to empty — called on logout so the next viewer
 * (anonymous, or a different friend logging in before hydrateFromServer
 * runs) never sees the previous user's watchlist. */
export function resetToEmpty(): void {
  symbols = [];
  hydrated = true;
  persist();
  notify();
}

/** Live-updating watchlist symbol list + per-symbol helpers, safe to call from any client component. */
export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    symbols: list,
    isWatched: (symbol: string) => list.includes(symbol.toUpperCase()),
    toggle: toggleWatchlist,
    remove: removeFromWatchlist,
  };
}
