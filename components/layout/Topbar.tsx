"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, Menu, User, UserPlus } from "lucide-react";
import { StoxLogo } from "@/components/branding/StoxLogo";
import { SymbolSearchInput } from "@/components/search/SymbolSearchInput";
import { SCREENER_UNIVERSE } from "@/lib/finance/screener-data";
import { useAuth } from "@/lib/auth/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";

interface TopbarProps {
  onMenuClick: () => void;
}

function initialsFor(username: string): string {
  const trimmed = username.trim();
  // This app collects a single username (not separate first/last name
  // fields), so there's no "first letter of each word" split to do the
  // way a full-name avatar usually would — just the first two characters,
  // uppercased, same idea as the old hardcoded "YR" placeholder.
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "?";
}

/**
 * Multi-User Authentication feature: the profile avatar/dropdown now
 * reflects real auth state from useAuth() instead of a hardcoded "YR" +
 * static menu. Logged out: a generic user-silhouette avatar and Log
 * In/Sign Up entries that open AuthModal. Logged in: the user's own
 * initials, their username/email shown at the top of the dropdown, the
 * existing Account link, and a real Log Out action.
 */
export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, ready, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function openAuth(tab: "login" | "signup") {
    setMenuOpen(false);
    setAuthTab(tab);
    setAuthModalOpen(true);
  }

  const loggedIn = ready && user != null;

  // QA fix (reversal of an earlier removal): a follow-up reference
  // screenshot of the Screener page showed this exact search bar IS part
  // of the persistent topbar, alongside a "N tickers · updated HH:MM UTC"
  // status readout before the avatar. The earlier removal was based on it
  // visually clashing with the Strategy Builder page's own large "$"
  // command input — that page-specific clash doesn't mean the topbar
  // shouldn't have it at all. Time is computed client-side (UTC, HH:MM) to
  // avoid an SSR/client hydration mismatch; starts null so nothing renders
  // until the first tick.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    function tick() {
      const now = new Date();
      setUpdatedAt(`${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`);
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="glass-panel sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
      {/* Mobile UX audit fix: h-9 w-9 (36px) is under the ~44px minimum
          recommended touch target — bumped both the hamburger menu button
          and the user-menu avatar trigger below to h-11 w-11 (44px). */}
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <StoxLogo size={24} showWordmark className="shrink-0 md:hidden" />
      <SymbolSearchInput />

      {/* QA fix: the status readout used to sit directly after the search
          box with no flex-grow of its own, leaving a large empty gap
          before the avatar (which was the only element pulling right via
          ml-auto) — so it read as floating just right of search rather
          than anchored to the far right edge next to the avatar, on every
          page that renders this shared Topbar. Moving ml-auto onto this
          wrapper (and off the avatar div) pins status+avatar together as
          one right-aligned group instead. */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {updatedAt && (
          <span className="hidden shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            {SCREENER_UNIVERSE.length} tickers · updated {updatedAt} UTC
          </span>
        )}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            aria-label={loggedIn ? "Open user menu" : "Open account menu"}
            aria-expanded={menuOpen}
          >
            {loggedIn && user ? initialsFor(user.username) : <User className="h-5 w-5" />}
          </button>

          {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+4px)] w-56 rounded-md border border-border bg-card py-1 shadow-lg">
            {loggedIn && user ? (
              <>
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-foreground">{user.username}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm text-foreground hover:bg-accent/60"
                >
                  Account
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-destructive hover:bg-accent/60"
                >
                  <LogOut className="h-4 w-4" /> Log Out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-foreground hover:bg-accent/60"
                >
                  <LogIn className="h-4 w-4" /> Log In
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-foreground hover:bg-accent/60"
                >
                  <UserPlus className="h-4 w-4" /> Sign Up
                </button>
              </>
            )}
            </div>
          )}
        </div>
      </div>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} initialTab={authTab} />
    </header>
  );
}
