"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, Menu, User, UserPlus } from "lucide-react";
import { FinLensLogo } from "@/components/branding/FinLensLogo";
import { SymbolSearchInput } from "@/components/search/SymbolSearchInput";
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
      <FinLensLogo size={24} showWordmark className="shrink-0 md:hidden" />
      <SymbolSearchInput />

      <div ref={menuRef} className="relative ml-auto">
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

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} initialTab={authTab} />
    </header>
  );
}
