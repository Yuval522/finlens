"use client";

export const TIME_RANGES = [
  "1D",
  "5D",
  "1M",
  "6M",
  "YTD",
  "1Y",
  "3Y",
  "5Y",
  "10Y",
  "Max",
] as const;

export type TimeRange = (typeof TIME_RANGES)[number];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="tab-scroll flex gap-1.5 py-1" role="tablist" aria-label="Chart time range">
      {TIME_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(range)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
