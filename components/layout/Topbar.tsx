"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

const USER_INITIALS = "YR";
const MENU_ITEMS = ["Account", "Payment", "Contact", "Logout"] as const;

export function Topbar() {
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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search stocks, symbol, companies..."
          className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

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
