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

// TEMP demo/prototype bypass (2026-08-14), now disabled (2026-08-16): the
// local dev environment briefly had no working database connection
// configured, so every real login/signup attempt 500s'd ("Something went
// wrong on our end") and every RequireAuth-gated page (Portfolio/
// Watchlist/Settings) was blocking on it entirely. With GUEST_MODE on, a
// missing/failed session silently resolved to this synthetic guest user
// instead of null — which also meant `loggedIn` in Topbar.tsx was always
// true, so the Log In/Sign Up entries never rendered at all and there was
// no way to reach real auth from the UI. Root cause of the "can't log in"
// report on production: this flag, not the domain rename (the session
// cookie in lib/auth/session.ts sets no explicit `domain` attribute, so it
// was never tied to the old finlens-nu.vercel.app host to begin with) and
// not NextAuth (this app doesn't use NextAuth — see lib/auth/session.ts's
// own doc comment for the actual opaque-token-in-Postgres design). Now
// that this is wired to a real Neon DATABASE_URL in production, flipping
// back to false restores real login/signup and the RequireAuth wall.
const GUEST_MODE = false;
const GUEST_USER: AuthUser = { id: "guest", username: "Guest", email: "guest@stox.local" };

type DataKey = "portfolio" | "watchlist" | "settings";

async function fetchUserData(key: DataKey): Promise<unknown> {
  try {
    // Mobile state-sync fix: `cache: "no-store"` on top of the route's own
    // no-store response header — belt-and-suspenders so this GET is never
    // served from the browser's own HTTP cache, which is the exact
    // mechanism that could otherwise show one device (typically mobile,
    // due to how often it backgrounds/foregrounds and re-requests this)
    // data that's gone stale since it changed on another device.
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
    // Best-effort — a transient network failure just means this particular
    // edit isn't saved server-side yet. localStorage still has it, and the
    // debounced push after the NEXT mutation reads the latest snapshot at
    // send-time, so it isn't lost, just delayed.
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
        // Mobile state-sync fix: cache: "no-store" — see fetchUserData's
        // identical doc comment above.
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await res.json();
        me = body.user ?? null;
      } catch {
        me = null;
      }
      if (me) {
        await hydrateAllFromServer();
      } else if (GUEST_MODE) {
        // No real session (likely: no DB configured here) — fall back to
        // the guest user instead of resetting/blocking. Whatever's already
        // in local storage (portfolio/watchlist/settings) is left alone,
        // same as pre-auth-feature behavior.
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

    // Mobile state-sync fix: mobile browsers background/foreground the
    // app (app-switching, screen lock, relaunching from a home-screen
    // icon) far more often than a desktop tab does. Some browsers restore
    // the page from the back/forward cache (bfcache) on return WITHOUT
    // re-running this mount effect at all, which — before this — meant a
    // returning mobile session just kept showing whatever was on screen
    // before backgrounding (a stale portfolio, an old avatar, cash that
    // hasn't picked up an edit made on desktop meanwhile) instead of
    // re-checking who's logged in and re-pulling their latest data.
    // `pageshow`'s `persisted` flag is exactly the signal a bfcache
    // restore fires; `visibilitychange`/`focus` are a defensive second net
    // for the cases that don't — the same combination
    // lib/finance/useBackgroundRefresh.ts already uses for live quotes,
    // extended here with the bfcache-specific `pageshow` check since a
    // full session + account-data re-sync is worth being more thorough
    // about than a quote refresh.
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

  // While logged in, push every local mutation to this user's server row
  // (debounced per-key so e.g. rapid-fire portfolio edits don't fire one
  // request per keystroke). Deliberately depends on [user] rather than
  // running unconditionally — logged-out edits (a fresh anonymous
  // visitor's demo portfolio, say) have nowhere to sync to and simply stay
  // local, same as before this feature existed.
  useEffect(() => {
    if (!user) return;

    // Captured once per effect run (rather than reading syncTimers.current
    // directly inside the cleanup below) so the cleanup closes over the
    // exact same object this effect's own scheduleSync calls mutated —
    // satisfies react-hooks/exhaustive-deps' ref-in-cleanup warning, and is
    // correct regardless: this effect only re-runs when `user` changes, at
    // which point any previous, still-pending debounced pushes for the old
    // user should indeed be cancelled.
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
    // getPortfolioSnapshot/getWatchlistSnapshot/getSettingsSnapshot are
    // stable module-level function references, not state — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Brand-new account: nothing saved server-side yet. Migrate whatever
    // is already sitting in this browser's local stores up to become this
    // account's starting data (local state already matches what we just
    // uploaded, so no need to hydrate back down afterward).
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

    // Overwrite whatever's currently local with THIS user's own
    // server-saved data — the core of strict data isolation between
    // friends sharing one browser/device.
    await hydrateAllFromServer();
    setUser(body.user);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the network call fails, still clear local state below —
      // the user clearly wants this browser to stop showing their data.
    }
    resetAllStores();
    // In GUEST_MODE, "logging out" clears local data (a fresh start) but
    // still resolves back to the guest user rather than null, so the
    // RequireAuth wall/login popup never reappears.
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
