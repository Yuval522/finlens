import { cn } from "@/lib/utils";

// Retro-Digital redesign: compact pixel-art robot-head brand mark — a
// black CRT-style head with an orange antenna nub and two orange "eye"
// pixels, replacing the old blue/teal waveform PNG emblem. Hand-authored
// as a small bitmap (see ROWS below) and rendered as raw SVG <rect> pixels
// with crispEdges shape-rendering, so it stays sharp and blocky at any
// size instead of rendering as a smooth vector icon — same "no rounded
// corners, no gradients" pixel-art rule used elsewhere in this redesign.
const ROWS = [
  "..........",
  "....OO....",
  "....OO....",
  "..DDDDDD..",
  ".DBBBBBBD.",
  ".DBOBBOBD.",
  ".DBBBBBBD.",
  ".DBBBBBBD.",
  "..DDDDDD..",
  "..........",
];

const COLORS: Record<string, string> = {
  O: "#FF5722", // antenna + eyes — brand orange-coral (--primary)
  D: "#1c1d20", // bezel edge — matches --border hairline
  B: "#050505", // head casing — near-black
};

interface RobotHeadMarkProps {
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
}

export function RobotHeadMark({ size = 28, className }: RobotHeadMarkProps) {
  const cols = ROWS[0].length;
  const rows = ROWS.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {ROWS.flatMap((row, r) =>
        row.split("").map((code, c) => {
          const fill = COLORS[code];
          if (!fill) return null;
          return <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} />;
        })
      )}
    </svg>
  );
}
