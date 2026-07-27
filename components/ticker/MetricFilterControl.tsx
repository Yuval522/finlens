"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface MetricFilterOption {
  key: string;
  label: string;
  color: string;
}

interface MetricFilterControlProps {
  options: MetricFilterOption[];
  visible: Set<string>;
  onToggle: (key: string) => void;
}

/**
 * "Filter Metrics" dropdown for multi-series charts (Balance Sheet's 3
 * grouped-comparison charts, Cash Flow's breakdown/earnings-quality
 * charts) — lets each individual bar be shown/hidden, matching the
 * reference terminal's per-chart metric checklist. A plain <select> (used
 * by ChartControls for Select Range/View/Chart Type) can't represent
 * multi-select checkboxes, so this is a small custom button+panel dropdown
 * instead, meant to be passed into ChartControls' `filterMetrics` slot.
 */
export function MetricFilterControl({ options, visible, onToggle }: MetricFilterControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="space-y-1" ref={ref}>
      <label className="block text-[11px] font-medium text-muted-foreground">Filter Metrics</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
        >
          {visible.size === options.length ? "All Metrics" : `${visible.size} of ${options.length}`}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[190px] space-y-0.5 rounded-md border border-border bg-card p-2 shadow-xl">
            {options.map((opt) => {
              // A chart with every series hidden is just an empty box with
              // no explanation — disable (rather than silently ignore) the
              // last remaining checked box so it's clear why it won't
              // uncheck, instead of it looking unresponsive.
              const isLastChecked = visible.size === 1 && visible.has(opt.key);
              return (
                <label
                  key={opt.key}
                  className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground ${
                    isLastChecked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent"
                  }`}
                  title={isLastChecked ? "At least one metric must stay visible" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={visible.has(opt.key)}
                    disabled={isLastChecked}
                    onChange={() => onToggle(opt.key)}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
