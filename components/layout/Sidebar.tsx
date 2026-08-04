"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Star,
  Briefcase,
  ScanSearch,
  Sparkles,
  Globe2,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { FinLensLogo } from "@/components/branding/FinLensLogo";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Watchlist", href: "/watchlist", icon: Star },
  { label: "Portfolio", href: "/portfolio", icon: Briefcase },
  { label: "Screener", href: "/screener", icon: ScanSearch },
  { label: "Strategy Builder", href: "/strategy", icon: Sparkles },
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
          <FinLensLogo size={28} showWordmark={!collapsed} className="min-w-0" />
          {/* Mobile UX audit fix: h-8 w-8 (32px) is under the ~44px minimum
              recommended touch target — this is the mobile-only close
              control for the nav drawer, so a comfortably-sized tap area
              matters more here than almost anywhere else in the app. */}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground md:hidden"
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
                  "group flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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

        {/*
          Collapse toggle (desktop only). QA note: a screenshot flagged a
          circular "N" badge overlapping this control, but there's no avatar
          or circle element anywhere in this file to begin with — the app's
          only user-avatar badge ("YR") lives in Topbar.tsx, top-right, not
          here. That strongly points to a browser extension's own injected
          UI (many note-taking/clipper-style extensions anchor a small badge
          to the bottom-left viewport corner) rather than anything FinLens
          renders. Still widened the hit area and made the icon a fixed,
          non-shrinking flex item with its own background so the control
          reads cleanly regardless of what else might be drawn nearby.
        */}
        {/*
          QA fix: this wrapper was cramped at p-3 with a px-3 py-2.5 button
          inside it — barely more breathing room than the nav links above,
          even though it's a standalone footer control. Widened to the full
          sidebar width with generous padding (w-full px-4 py-3) so the
          collapse button reads as its own clearly separated section.
        */}
        <div className="hidden w-full border-t border-border px-4 py-3 md:block">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              {collapsed ? (
                <ChevronRight className="h-[18px] w-[18px]" />
              ) : (
                <ChevronLeft className="h-[18px] w-[18px]" />
              )}
            </span>
            {!collapsed && <span className="truncate">Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
