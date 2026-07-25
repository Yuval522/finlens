"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-only settings store, persisted to localStorage — same
 * module-level-store + useSyncExternalStore pattern as
 * lib/watchlist/store.ts (see that file's doc comment for the rationale:
 * FinLens has no backend/accounts, so "settings" means "remembered on this
 * browser"). Kept as a single settings object rather than one entry per
 * field, since the whole point of the Settings page is editing several of
 * these together.
 */

export type AccentColor = "blue" | "emerald" | "amber" | "rose" | "violet";

export interface FinLensSettings {
  displayName: string;
  accentColor: AccentColor;
  defaultCurrency: "USD" | "ILS";
  compactNumbers: boolean;
  priceAlerts: boolean;
  newsAlerts: boolean;
  weeklyDigest: boolean;
  dataSourceKeys: {
    finnhub: string;
    polygon: string;
    alphaVantage: string;
  };
}

export const DEFAULT_SETTINGS: FinLensSettings = {
  displayName: "Yuval",
  accentColor: "blue",
  defaultCurrency: "USD",
  compactNumbers: true,
  priceAlerts: true,
  newsAlerts: false,
  weeklyDigest: true,
  dataSourceKeys: { finnhub: "", polygon: "", alphaVantage: "" },
};

const STORAGE_KEY = "finlens:settings";

let settings: FinLensSettings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function readFromStorage(): FinLensSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Shallow-merge over defaults so adding a new setting later doesn't
    // break existing users' saved (older-shape) JSON.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      dataSourceKeys: { ...DEFAULT_SETTINGS.dataSourceKeys, ...(parsed?.dataSourceKeys ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  settings = readFromStorage();
  hydrated = true;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full/unavailable — in-memory settings still work this session.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) {
      settings = readFromStorage();
      notify();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): FinLensSettings {
  ensureHydrated();
  return settings;
}

function getServerSnapshot(): FinLensSettings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(patch: Partial<FinLensSettings>): void {
  ensureHydrated();
  settings = { ...settings, ...patch };
  persist();
  notify();
}

export function updateDataSourceKey(provider: keyof FinLensSettings["dataSourceKeys"], value: string): void {
  ensureHydrated();
  settings = { ...settings, dataSourceKeys: { ...settings.dataSourceKeys, [provider]: value } };
  persist();
  notify();
}

export function resetSettings(): void {
  ensureHydrated();
  settings = DEFAULT_SETTINGS;
  persist();
  notify();
}

export function useSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
