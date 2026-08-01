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
 * QA fix (live comparison flagged this overflowing past card/viewport
 * edges): this used to be centered on the icon (`left-1/2
 * -translate-x-1/2`) at a fixed 240px width, which overflows whenever the
 * icon sits closer than 120px to an edge — every current call site places
 * the icon immediately after a left-aligned heading, so it's anchored
 * left (growing rightward) instead, which only needs room on ONE side.
 * `max-w-[calc(100vw-2rem)]` is a second, viewport-level safety net for
 * very narrow screens where even that isn't enough room. Still
 * deliberately dependency-free (pure CSS group-hover/focus-within, no
 * positioning library, no boundary-flip JS) — unlike ChartTooltip.tsx (a
 * Recharts chart-data tooltip that has to follow the cursor to anywhere
 * on a chart), this only ever anchors a small, fixed-position icon whose
 * surrounding layout is known ahead of time.
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
        className="glass-card pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-60 max-w-[calc(100vw-2rem)] rounded-lg border p-2.5 text-left text-[11px] font-normal leading-relaxed text-foreground opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
