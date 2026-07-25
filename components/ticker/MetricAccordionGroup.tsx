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
        className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3">
          {items.map((item) => (
            <div key={item.label} className="contents">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-right font-mono text-xs text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
