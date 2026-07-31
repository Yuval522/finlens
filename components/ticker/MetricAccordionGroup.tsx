"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface MetricRow {
  label: string;
  value: string;
}

interface MetricAccordionGroupProps {
  title: string;
  items: MetricRow[];
  defaultOpen?: boolean;
}

export function MetricAccordionGroup({
  title,
  items,
  defaultOpen = false,
}: MetricAccordionGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-800/80 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between py-3 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {/* Mobile UX audit fix: this used to be a hard `{open && (...)}`
          conditional render — content popped in/out instantly with no
          transition, which reads as "broken" rather than "collapsed" on a
          touch device where the expand/collapse gesture is the primary way
          of navigating a dense settings/metrics list. Grid-rows-based
          height animation (0fr -> 1fr) gets a smooth open/close without
          needing to measure actual content height in JS — content stays
          mounted so the row heights it animates to/from are always real,
          and aria-hidden keeps it out of the accessibility tree while
          collapsed even though it's technically still in the DOM. */}
      <div
        className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!open}
      >
        <dl className="grid min-h-0 grid-cols-2 gap-x-3 gap-y-2 pb-3">
          {items.map((item) => (
            <div key={item.label} className="contents">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-right font-mono text-xs text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
