"use client";

import { cn } from "@/lib/utils";

interface CurrencyToggleProps {
  value: "USD" | "ILS";
  onChange: (value: "USD" | "ILS") => void;
}

/** Small USD/ILS pill switch beneath the portfolio header's total value, matching the reference terminal. */
export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  const isIls = value === "ILS";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isIls}
      aria-label={`Display totals in ${isIls ? "USD" : "ILS"}`}
      onClick={() => onChange(isIls ? "USD" : "ILS")}
      className="relative h-6 w-14 shrink-0 rounded-full bg-success/80 transition-colors hover:bg-success"
    >
      {/* Static label, absolutely positioned so the sliding handle (also
          absolute) can never overlap it via transform the way a plain flex
          layout would — transforms don't reflow siblings. */}
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white">
        {isIls ? "₪" : "$"}
      </span>
      <span
        className={cn(
          "absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
          isIls ? "translate-x-8" : "translate-x-0"
        )}
      />
    </button>
  );
}
