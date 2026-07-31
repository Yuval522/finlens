"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { FinLensLogo } from "@/components/branding/FinLensLogo";
import { SymbolSearchInput } from "@/components/search/SymbolSearchInput";

const USER_INITIALS = "YR";
const MENU_ITEMS = ["Account", "Payment", "Contact", "Logout"] as const;

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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
          aria-label="Open user menu"
          aria-expanded={menuOpen}
        >
          {USER_INITIALS}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+4px)] w-48 rounded-md border border-border bg-card py-1 shadow-lg">
            {MENU_ITEMS.map((item) =>
              // QA polish: now that /settings is a real page, route "Account"
              // there instead of leaving it as a dead button — the other
              // items (Payment/Contact/Logout) have no backing page yet, so
              // they stay inert placeholders.
              item === "Account" ? (
                <Link
                  key={item}
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm text-foreground hover:bg-accent/60"
                >
                  {item}
                </Link>
              ) : (
                <button
                  key={item}
                  type="button"
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm text-foreground hover:bg-accent/60"
                >
                  {item}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </header>
  );
}
