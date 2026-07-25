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
    <div
      className={`glass-card min-w-0 rounded-xl p-3 sm:p-4 ${
        fullscreen ? "fixed inset-4 z-50 overflow-auto" : className
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
  );
}
