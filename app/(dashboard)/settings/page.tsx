"use client";

import { useEffect, useState } from "react";
import { Bell, KeyRound, Palette, RotateCcw, Settings as SettingsIcon, User } from "lucide-react";
import { resetSettings, updateSettings, useSettings, type AccentColor } from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { RequireAuth } from "@/components/auth/RequireAuth";

// Secure API Keys Migration: kept as a small, client-safe local constant
// rather than importing lib/db/apiKeys.ts's API_KEY_PROVIDERS directly —
// that module (and everything it imports, down to @neondatabase/serverless)
// is server-only and would break the client bundle if pulled into a
// "use client" file. The route handler is the single source of truth for
// which providers are actually valid; this list only drives which inputs
// render.
const API_KEY_PROVIDERS = ["finnhub", "polygon", "alphaVantage"] as const;
type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];
const PROVIDER_LABELS: Record<ApiKeyProvider, string> = {
  finnhub: "Finnhub",
  polygon: "Polygon",
  alphaVantage: "Alpha Vantage",
};

interface ApiKeyStatus {
  configured: boolean;
  last4: string | null;
  updatedAt: number | null;
}
type ApiKeyStatusMap = Record<ApiKeyProvider, ApiKeyStatus>;

const EMPTY_DRAFTS: Record<ApiKeyProvider, string> = { finnhub: "", polygon: "", alphaVantage: "" };
const EMPTY_BUSY: Record<ApiKeyProvider, boolean> = { finnhub: false, polygon: false, alphaVantage: false };
const EMPTY_ROW_ERRORS: Record<ApiKeyProvider, string | null> = { finnhub: null, polygon: null, alphaVantage: null };

const ACCENT_OPTIONS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "blue", label: "Blue", swatch: "bg-blue-500" },
  { id: "emerald", label: "Emerald", swatch: "bg-emerald-500" },
  { id: "amber", label: "Amber", swatch: "bg-amber-500" },
  { id: "rose", label: "Rose", swatch: "bg-rose-500" },
  { id: "violet", label: "Violet", swatch: "bg-violet-500" },
];

function SectionCard({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  iconClassName: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card space-y-4 rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconClassName)}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

// QA fix (screenshot flagged the previous version as "too thick/awkward
// pill shapes"): rebuilt to the standard iOS/terminal-style switch
// proportions — an 11x6 (44x24px) track with 2px inset padding so the
// thumb has even breathing room on both sides, and a flex layout instead
// of absolute positioning for the thumb so the translate distance is
// exactly track-width minus thumb-width minus insets, not a hand-tuned
// magic number.
// Mobile UX audit fix: the switch track itself is a deliberately
// iOS-proportioned 24x44px (see the QA comment this replaced) — a good
// visual size, but only 24px tall as a touch target. Rather than change
// that visual design, `Switch` is now purely decorative (aria-hidden) and
// `ToggleRow` below is the actual interactive control: the WHOLE row
// (title + description + switch) is one `role="switch"` button, so the
// real tappable area comfortably clears the ~44px minimum without
// changing how the switch itself looks.
function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-primary" : "bg-zinc-700"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full bg-white shadow-md transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </span>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-4 rounded-md py-1.5 text-left transition-colors hover:bg-accent/40"
    >
      <div className="min-w-0">
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} />
    </button>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none";

function SettingsContent() {
  const settings = useSettings();
  const { user } = useAuth();
  const [savedFlash, setSavedFlash] = useState(false);

  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Retro-Digital redesign: page hero centered (icon, title, subtitle
          stacked) instead of the old left-aligned icon+title row; the
          "Saved" flash keeps its own corner position via absolute
          placement on this now-relative wrapper rather than sharing the
          old justify-between row (which would fight with centering). */}
      <div className="relative flex flex-col items-center gap-2 text-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <SettingsIcon className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">Preferences are saved to your account</p>
        </div>
        {savedFlash && (
          <span className="absolute right-0 top-1 text-xs font-medium text-success">Saved</span>
        )}
      </div>

      {/* Profile & Account */}
      <SectionCard icon={User} iconClassName="bg-primary/15 text-primary" title="Profile & Account" description="Your display details">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
            {settings.displayName.slice(0, 2).toUpperCase() || "YR"}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Display Name</label>
              <input
                type="text"
                value={settings.displayName}
                onChange={(e) => updateSettings({ displayName: e.target.value })}
                onBlur={flashSaved}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={user?.email ?? ""}
                readOnly
                disabled
                className={cn(INPUT_CLASS, "cursor-not-allowed opacity-60")}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Theme / Display */}
      <SectionCard icon={Palette} iconClassName="bg-violet-500/15 text-violet-400" title="Theme & Display" description="Appearance preferences">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">Stox is a dark-mode-first terminal</p>
          </div>
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-foreground">Dark (default)</span>
        </div>

        <div>
          <p className="mb-2 text-sm text-foreground">Accent Color</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  updateSettings({ accentColor: opt.id });
                  flashSaved();
                }}
                title={opt.label}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-card transition-shadow",
                  opt.swatch,
                  settings.accentColor === opt.id ? "ring-foreground" : "ring-transparent"
                )}
                aria-label={opt.label}
                aria-pressed={settings.accentColor === opt.id}
              />
            ))}
          </div>
        </div>

        <ToggleRow
          title="Compact numbers"
          description='Show "$4.89T" instead of full figures across the app'
          checked={settings.compactNumbers}
          onChange={(v) => {
            updateSettings({ compactNumbers: v });
            flashSaved();
          }}
        />
      </SectionCard>

      {/* API Keys / Data Sources */}
      <ApiKeysSection />

      {/* Notifications */}
      <SectionCard icon={Bell} iconClassName="bg-sky-500/15 text-sky-400" title="Notifications & Alerts" description="Choose what Stox should notify you about">
        <ToggleRow
          title="Price alerts"
          description="Notify when a watchlist symbol crosses a threshold"
          checked={settings.priceAlerts}
          onChange={(v) => {
            updateSettings({ priceAlerts: v });
            flashSaved();
          }}
        />
        <ToggleRow
          title="News alerts"
          description="Notify on major news for your holdings"
          checked={settings.newsAlerts}
          onChange={(v) => {
            updateSettings({ newsAlerts: v });
            flashSaved();
          }}
        />
        <ToggleRow
          title="Weekly digest"
          description="A weekly summary of your portfolio and watchlist"
          checked={settings.weeklyDigest}
          onChange={(v) => {
            updateSettings({ weeklyDigest: v });
            flashSaved();
          }}
        />
      </SectionCard>

      <button
        type="button"
        onClick={() => {
          resetSettings();
          flashSaved();
        }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
      >
        <RotateCcw className="h-3 w-3" />
        Reset all settings to defaults
      </button>
    </div>
  );
}

/**
 * Secure API Keys Migration: unlike every other section on this page,
 * these fields are NOT backed by lib/settings/store.ts (localStorage +
 * generic debounced sync) — they talk directly to the dedicated,
 * auth-gated /api/settings/api-keys route, which encrypts at rest and
 * never sends a real key back to the browser once saved (see that route's
 * doc comment and lib/db/apiKeys.ts). This component only ever holds a
 * masked status (last 4 chars) once a key is configured, plus whatever the
 * user is actively typing into an unsaved draft.
 */
function ApiKeysSection() {
  const [status, setStatus] = useState<ApiKeyStatusMap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(EMPTY_DRAFTS);
  const [busy, setBusy] = useState(EMPTY_BUSY);
  const [rowErrors, setRowErrors] = useState(EMPTY_ROW_ERRORS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/api-keys", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Failed to load API key status");
        if (!cancelled) setStatus(body.keys as ApiKeyStatusMap);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load API key status");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(provider: ApiKeyProvider) {
    const value = drafts[provider].trim();
    if (!value) return;
    setBusy((b) => ({ ...b, [provider]: true }));
    setRowErrors((e) => ({ ...e, [provider]: null }));
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to save key");
      setStatus(body.keys as ApiKeyStatusMap);
      setDrafts((d) => ({ ...d, [provider]: "" }));
    } catch (err) {
      setRowErrors((e) => ({ ...e, [provider]: err instanceof Error ? err.message : "Failed to save key" }));
    } finally {
      setBusy((b) => ({ ...b, [provider]: false }));
    }
  }

  async function handleRemove(provider: ApiKeyProvider) {
    setBusy((b) => ({ ...b, [provider]: true }));
    setRowErrors((e) => ({ ...e, [provider]: null }));
    try {
      const res = await fetch(`/api/settings/api-keys?provider=${encodeURIComponent(provider)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to remove key");
      setStatus(body.keys as ApiKeyStatusMap);
    } catch (err) {
      setRowErrors((e) => ({ ...e, [provider]: err instanceof Error ? err.message : "Failed to remove key" }));
    } finally {
      setBusy((b) => ({ ...b, [provider]: false }));
    }
  }

  return (
    <SectionCard
      icon={KeyRound}
      iconClassName="bg-amber-500/15 text-amber-400"
      title="API Keys & Data Sources"
      description="Encrypted at rest and tied to your account — used server-side only, never sent back to this browser once saved"
    >
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {API_KEY_PROVIDERS.map((provider) => {
        const s = status?.[provider];
        const isBusy = busy[provider];
        return (
          <div key={provider} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{PROVIDER_LABELS[provider]} API Key</label>
            {s?.configured ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                  •••• ending in {s.last4}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(provider)}
                  disabled={isBusy}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={status ? "Not set" : "Loading…"}
                  disabled={!status || isBusy}
                  value={drafts[provider]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [provider]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave(provider);
                  }}
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => handleSave(provider)}
                  disabled={isBusy || !drafts[provider].trim()}
                  className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}
            {rowErrors[provider] && <p className="text-xs text-destructive">{rowErrors[provider]}</p>}
          </div>
        );
      })}
    </SectionCard>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth
      title="Log in to manage settings"
      description="Your preferences (display name, theme, alerts) are tied to your account."
    >
      <SettingsContent />
    </RequireAuth>
  );
}
