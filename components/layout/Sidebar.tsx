"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Star,
  Briefcase,
  ScanSearch,
  Globe2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LineChart,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Watchlist", href: "/watchlist", icon: Star },
  { label: "Portfolio", href: "/portfolio", icon: Briefcase },
  { label: "Screener", href: "/screener", icon: ScanSearch },
  { label: "Macro", href: "/macro", icon: Globe2 },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "glass-panel fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-border transition-transform duration-200 ease-in-out",
          "md:sticky md:top-0 md:z-40 md:translate-x-0 md:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          !mobileOpen && (collapsed ? "md:w-[76px]" : "md:w-60")
        )}
      >
        {/* Wordmark */}
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <div className="brand-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <LineChart className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-tight">
              FinLens
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                title={collapsed ? label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  collapsed && "md:justify-center md:px-0"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active && "text-primary"
                  )}
                />
                <span className={cn("truncate", collapsed && "md:hidden")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden border-t border-border p-3 md:block">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-[18px] w-[18px]" />
            ) : (
              <ChevronLeft className="h-[18px] w-[18px]" />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
