"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

/**
 * Small explanatory-tooltip primitive — first dedicated tooltip *component*
 * in this codebase (every prior "explain this label" affordance elsewhere,
 * e.g. RatiosPanel.tsx's footnoted `<dt title="...">`, uses a plain native
 * `title=""` attribute instead). Built for the Score tab's GuruFocus-style
 * rating pillars, which need a few sentences of explanation per pillar —
 * more than a native title tooltip reads comfortably — but kept generic
 * (components/shared/, not components/ticker/) since any future panel
 * needing the same thing can reuse it.
 *
 * Deliberately dependency-free: pure CSS group-hover/focus-within, no
 * positioning library. This only ever anchors a small, fixed-size info
 * icon inside a card that already has room above it, so — unlike
 * ChartTooltip.tsx (a Recharts *chart-data* tooltip solving a completely
 * different problem: a cursor-following box that can hit a viewport edge
 * on mobile) — there's no boundary-detection/flip logic needed here.
 */
export function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus:outline-none"
        aria-label="More info"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="glass-card pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border p-2.5 text-left text-[11px] font-normal leading-relaxed text-foreground opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
