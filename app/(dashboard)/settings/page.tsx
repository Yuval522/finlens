"use client";

import { useState } from "react";
import { Bell, KeyRound, Palette, RotateCcw, Settings as SettingsIcon, User } from "lucide-react";
import {
  resetSettings,
  updateDataSourceKey,
  updateSettings,
  useSettings,
  type AccentColor,
} from "@/lib/settings/store";
import { cn } from "@/lib/utils";

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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-accent"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
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
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none";

export default function SettingsPage() {
  const settings = useSettings();
  const [savedFlash, setSavedFlash] = useState(false);

  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-500/15 text-slate-300">
            <SettingsIcon className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">Preferences are saved to this browser</p>
          </div>
        </div>
        {savedFlash && <span className="text-xs font-medium text-success">Saved</span>}
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
              <input type="email" value="yuvalro123@gmail.com" readOnly disabled className={cn(INPUT_CLASS, "cursor-not-allowed opacity-60")} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Theme / Display */}
      <SectionCard icon={Palette} iconClassName="bg-violet-500/15 text-violet-400" title="Theme & Display" description="Appearance preferences">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">FinLens is a dark-mode-first terminal</p>
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
                  "flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-card transition-shadow",
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
      <SectionCard icon={KeyRound} iconClassName="bg-amber-500/15 text-amber-400" title="API Keys & Data Sources" description="Stored only in this browser's local storage, never sent anywhere by FinLens itself">
        {(["finnhub", "polygon", "alphaVantage"] as const).map((provider) => (
          <div key={provider}>
            <label className="text-xs font-medium capitalize text-muted-foreground">
              {provider === "alphaVantage" ? "Alpha Vantage" : provider} API Key
            </label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Not set"
              value={settings.dataSourceKeys[provider]}
              onChange={(e) => updateDataSourceKey(provider, e.target.value)}
              onBlur={flashSaved}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} iconClassName="bg-sky-500/15 text-sky-400" title="Notifications & Alerts" description="Choose what FinLens should notify you about">
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
