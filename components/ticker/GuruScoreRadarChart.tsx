"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { GuruPillar } from "@/lib/finance/score-gurufocus";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/format/chart";
import { cn } from "@/lib/utils";

interface GuruScoreRadarChartProps {
  pillars: GuruPillar[];
  overallScore: number | null;
  overallRank: number | null;
  overallLabel: string;
}

type Tone = "good" | "ok" | "bad" | "none";

function tone(rank: number | null): Tone {
  if (rank == null) return "none";
  if (rank >= 6) return "good";
  if (rank >= 4) return "ok";
  return "bad";
}

const TONE_HEX: Record<Tone, string> = {
  good: "#10B981",
  ok: "#F59E0B",
  bad: "#EF4444",
  none: "#64748B",
};

const TONE_BADGE: Record<Tone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  ok: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  none: "border-border bg-muted text-muted-foreground",
};

interface RadarRow {
  pillar: string;
  /** 0-10, with a null rank coerced to 0 so the polygon can still be drawn — see displayRank for the real value shown in the tooltip. */
  rank: number;
  displayRank: number | null;
}

interface RadarTooltipProps {
  active?: boolean;
  payload?: { payload?: RadarRow }[];
}

/** Passed as a JSX element (not a function) to `content` — same convention
 *  used by every other custom Recharts tooltip in this codebase. Recharts'
 *  default boundary containment (no allowEscapeViewBox override here)
 *  already keeps this inside the chart's own SVG bounds, so no
 *  edge-flip logic is needed the way FairValueHistoryChart's tooltip
 *  needed one. */
function RadarTooltip({ active, payload }: RadarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="font-semibold text-foreground">{row.pillar}</p>
      <p className="font-mono text-foreground">{row.displayRank != null ? `${row.displayRank}/10` : "—"}</p>
    </div>
  );
}

/**
 * GuruFocus-style 5-pillar radar/pentagon chart for the Multi-Factor
 * Rating — supplements (doesn't replace) the detailed pillar cards below
 * it, which still carry the per-metric breakdown a polygon chart can't
 * show. FinLens's own approximation of the *shape* of GuruFocus's public
 * GF Score pentagon; not affiliated with, endorsed by, or sourced from
 * GuruFocus LLC. Not investment advice.
 */
export function GuruScoreRadarChart({ pillars, overallScore, overallRank, overallLabel }: GuruScoreRadarChartProps) {
  const data: RadarRow[] = pillars.map((p) => ({ pillar: p.name, rank: p.rank ?? 0, displayRank: p.rank }));
  const t = tone(overallRank);

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Multi-Factor Score</h3>
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", TONE_BADGE[t])}>
          {overallScore != null ? `${overallScore}/100` : "—"}
        </span>
      </div>

      <div className="h-[280px] w-full sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="rgba(148,163,184,0.18)" />
            <PolarAngleAxis dataKey="pillar" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <PolarRadiusAxis angle={90} domain={[0, 10]} tick={false} axisLine={false} />
            <Tooltip content={<RadarTooltip />} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} />
            <Radar
              dataKey="rank"
              stroke={TONE_HEX[t]}
              fill={TONE_HEX[t]}
              fillOpacity={0.35}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1 text-center text-xs text-muted-foreground">{overallLabel} overall</p>
    </div>
  );
}
