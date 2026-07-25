"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
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
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <SymbolSearchInput />

      <div ref={menuRef} className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          aria-label="Open user menu"
          aria-expanded={menuOpen}
        >
          {USER_INITIALS}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-11 w-48 rounded-md border border-border bg-card py-1 shadow-lg">
            {MENU_ITEMS.map((item) => (
              <button
                key={item}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/60"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
