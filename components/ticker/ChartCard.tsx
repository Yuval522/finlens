"use client";

import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Shared single-chart glass card used across the Income/Balance/Cash Flow
 * tabs — was previously duplicated verbatim in IncomeStatementPanel and
 * BalanceSheetPanel (Phase 5 rebuild consolidates it here since the tab
 * count doubled and inline duplication was getting out of hand).
 */
export function ChartCard({
  title,
  subtitle,
  children,
  fullscreen,
  onToggleFullscreen,
  className = "",
  height = "h-64",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  className?: string;
  height?: string;
}) {
  return (
    <>
      {/*
        QA polish: the maximize control itself already existed (this card
        has had a fullscreen toggle since Phase 5's rebuild), but expanding
        it had no dimmed backdrop behind it and shared the same z-50 as the
        mobile sidebar drawer — on a narrow viewport with the drawer open,
        the two could contend for stacking order. A backdrop makes the
        "this chart is now front-and-center" state unambiguous and gives a
        click-outside-to-close affordance; bumping to z-[60] guarantees the
        expanded chart always wins over the sidebar (z-50) or topbar.
      */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm"
          onClick={onToggleFullscreen}
          aria-hidden="true"
        />
      )}
      <div
        className={`glass-card min-w-0 rounded-xl p-3 sm:p-4 ${
          fullscreen
            ? "fixed inset-4 z-[60] overflow-auto shadow-2xl sm:inset-x-[8%] sm:inset-y-[6%]"
            : className
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={fullscreen ? "Collapse" : "Expand"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className={fullscreen ? "h-[70vh] w-full" : `${height} w-full`}>{children}</div>
      </div>
    </>
  );
}
