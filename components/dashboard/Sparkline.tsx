import { cn } from "@/lib/utils";

interface SparklineProps {
  /** Chronological series (oldest first) — typically recent daily closes. */
  values: number[];
  direction: "up" | "down" | "flat";
  className?: string;
}

const WIDTH = 100;
const HEIGHT = 32;

/**
 * Subtle, clean mini price-trend line for IndexSummaryCard — a plain
 * server-renderable inline SVG (no chart library, no client JS) since this
 * is decorative, not interactive: no tooltip/crosshair, just a quiet
 * visual echo of the recent trend sitting in the card's own background.
 * `currentColor` + a text-* color class (rather than passing hex colors
 * in) keeps it consistent with the rest of the app's success/destructive
 * token usage.
 */
export function Sparkline({ values, direction, className }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * WIDTH;
    const y = HEIGHT - ((v - min) / span) * HEIGHT;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  const colorClass =
    direction === "up" ? "text-success" : direction === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full overflow-visible", colorClass, className)}
      aria-hidden="true"
    >
      <path d={areaPath} fill="currentColor" opacity="0.12" stroke="none" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
