"use client";

import { CHART_TOOLTIP_STYLE, shouldFlipTooltip } from "@/lib/format/chart";

export interface ChartTooltipEntry {
  key: string;
  label: string;
  value: string;
  color?: string;
}

interface ChartTooltipRow {
  fiscalYear: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  data: ChartTooltipRow[];
  entries: ChartTooltipEntry[];
}

/**
 * Shared custom Recharts `<Tooltip content={...}>` renderer, replacing the
 * default `contentStyle`+`formatter` renderer wherever a chart needs
 * boundary-aware positioning (see shouldFlipTooltip() in lib/format/chart.ts
 * for the "why" — this is the visual half of that fix, matching the bug
 * report on the Gross Profit / Income Statement charts). Used by any single-
 * or multi-series bar chart that used to rely on Recharts' default tooltip;
 * CashFlowPanel's already-custom `CashFlowTooltip` applies the same
 * `shouldFlipTooltip` helper directly instead of using this component, to
 * keep its own richer glass-card styling untouched.
 */
export function ChartTooltip({ active, label, data, entries }: ChartTooltipProps) {
  if (!active || !label || entries.length === 0) return null;

  const flip = shouldFlipTooltip(label, data);

  return (
    <div
      style={{
        ...CHART_TOOLTIP_STYLE,
        transform: flip ? "translateX(-100%)" : undefined,
      }}
    >
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      <div className="space-y-1">
        {entries.map((entry) => (
          <div key={entry.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {entry.color && (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              )}
              {entry.label}
            </span>
            <span className="font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
