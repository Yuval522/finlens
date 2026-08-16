"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthUser } from "./types";
import {
  getRawSnapshot as getPortfolioSnapshot,
  hydrateFromServer as hydratePortfolioFromServer,
  resetToEmpty as resetPortfolioToEmpty,
  subscribe as subscribePortfolio,
} from "@/lib/portfolio/store";
import {
  getRawSnapshot as getWatchlistSnapshot,
  hydrateFromServer as hydrateWatchlistFromServer,
  resetToEmpty as resetWatchlistToEmpty,
  subscribe as subscribeWatchlist,
} from "@/lib/watchlist/store";
import {
  getRawSnapshot as getSettingsSnapshot,
  hydrateFromServer as hydrateSettingsFromServer,
  resetToDefault as resetSettingsToDefault,
  subscribe as subscribeSettings,
} from "@/lib/settings/store";

/**
 * Multi-User Authentication + Data Isolation.
 *
 * This is the one place that knows how to bridge the three pre-existing,
 * auth-agnostic localStorage stores (portfolio/watchlist/settings) to a
 * real per-user server row, so none of those stores' own mutators
 * (addHolding, toggleWatchlist, updateSettings, ...) needed to change to
 * know a login system exists:
 *
 * - On initial load: check /api/auth/me. If a session cookie resolves to a
 *   user, pull THAT user's saved portfolio/watchlist/settings from the
 *   server and overwrite local state with it (hydrateFromServer) — this is
 *   what makes "Friend B logs in on the same browser" show Friend B's data
 *   instead of whatever was last sitting in localStorage.
 * - On login: same hydrate-from-server overwrite.
 * - On signup: the opposite direction — a brand-new account has nothing
 *   saved yet, so whatever is CURRENTLY in this browser's local stores
 *   (the "existing local data" the user asked to migrate) gets pushed up
 *   to become that new account's starting data.
 * - On logout: local stores reset to empty/default so the next viewer of
 *   this browser (anonymous, or a different friend who hasn't logged in
 *   yet) never sees the previous user's holdings, watchlist, or settings.
 * - While logged in: each store's own subscribe() is used to notice every
 *   mutation and debounce-push the latest snapshot back to that user's
 *   server row, so switching devices/browsers (or just a fresh login on
 *   the same one) always picks up the latest state.
 *
 * `ready` gates rendering (see the layout that mounts AuthProvider) so the
 * very first paint never flashes stale/demo local data before the
 * session-check + hydration above has had a chance to run.
 */

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  signup: (input: { username: string; email: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  login: (input: { identifier: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST_MODE = false;
const GUEST_USER: AuthUser = { id: "guest", username: "Guest", email: "guest@finlens.local" };

type DataKey = "portfolio" | "watchlist" | "settings";

async function fetchUserData(key: DataKey): Promise<unknown> {
  try {
    const res = await fetch(`/api/user-data/${key}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

async function pushUserData(key: DataKey, value: unknown): Promise<void> {
  try {
    await fetch(`/api/user-data/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  } catch {
    // Best-effort
  }
}

async function hydrateAllFromServer(): Promise<void> {
  const [portfolio, watchlist, settings] = await Promise.all([
    fetchUserData("portfolio"),
    fetchUserData("watchlist"),
    fetchUserData("settings"),
  ]);
  hydratePortfolioFromServer(portfolio);
  hydrateWatchlistFromServer(watchlist);
  hydrateSettingsFromServer(settings);
}

function resetAllStores(): void {
  resetPortfolioToEmpty();
  resetWatchlistToEmpty();
  resetSettingsToDefault();
}

async function migrateLocalDataToServer(): Promise<void> {
  await Promise.all([
    pushUserData("portfolio", getPortfolioSnapshot()),
    pushUserData("watchlist", getWatchlistSnapshot()),
    pushUserData("settings", getSettingsSnapshot()),
  ]);
}

const SYNC_DEBOUNCE_MS = 600;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const syncTimers = useRef<Partial<Record<DataKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function syncSession() {
      if (inFlight) return;
      inFlight = true;
      let me: AuthUser | null = null;
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await res.json();
        me = body.user ?? null;
      } catch {
        me = null;
      }
      if (me) {
        await hydrateAllFromServer();
      } else if (GUEST_MODE) {
        me = GUEST_USER;
      } else {
        resetAllStores();
      }
      if (!cancelled) {
        setUser(me);
        setReady(true);
      }
      inFlight = false;
    }

    void syncSession();

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void syncSession();
    }
    function handleRevisit() {
      if (document.visibilityState === "visible") void syncSession();
    }
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleRevisit);
    window.addEventListener("focus", handleRevisit);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleRevisit);
      window.removeEventListener("focus", handleRevisit);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const timers = syncTimers.current;

    function scheduleSync(key: DataKey, getter: () => unknown) {
      const existing = timers[key];
      if (existing) clearTimeout(existing);
      timers[key] = setTimeout(() => {
        void pushUserData(key, getter());
      }, SYNC_DEBOUNCE_MS);
    }

    const unsubscribers = [
      subscribePortfolio(() => scheduleSync("portfolio", getPortfolioSnapshot)),
      subscribeWatchlist(() => scheduleSync("watchlist", getWatchlistSnapshot)),
      subscribeSettings(() => scheduleSync("settings", getSettingsSnapshot)),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      for (const timer of Object.values(timers)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, [user]);

  const signup = useCallback<AuthContextValue["signup"]>(async (input) => {
    let res: Response;
    try {
      res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch {
      return { ok: false, error: "Network error — please try again" };
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? "Sign up failed" };

    await migrateLocalDataToServer();
    setUser(body.user);
    return { ok: true };
  }, []);

  const login = useCallback<AuthContextValue["login"]>(async (input) => {
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch {
      return { ok: false, error: "Network error — please try again" };
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? "Login failed" };

    await hydrateAllFromServer();
    setUser(body.user);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort
    }
    resetAllStores();
    setUser(GUEST_MODE ? GUEST_USER : null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signup, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
