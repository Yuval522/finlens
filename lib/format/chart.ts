/** Shared Recharts helpers for the ticker analysis tabs (Income, Balance, ...). */

export function compactAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(0)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return `${value}`;
}

// QA hotfix (Final Polish pass, re-checked in the iCharts audit pass):
// values like "Cash & ST Investments: 55B USD" were getting clipped at the
// tooltip's right edge — Recharts' default tooltip box sizes to its
// content but without an explicit minimum width, a long label + value +
// currency suffix combination can render tighter than expected on some
// viewport/zoom combinations. minWidth + nowrap (so the box grows instead
// of wrapping awkwardly) plus generous padding fixes this without needing
// to drop the currency suffix. Bumped minWidth further (200 -> 224px) and
// added explicit box-sizing on this re-check, since a fixed-width box
// whose padding isn't included in that width can still clip its last
// character or two under content-box sizing — border-box guarantees the
// full 224px is always available to the text itself.
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#0f1420",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "0.5rem",
  fontSize: "12px",
  fontFamily: "var(--font-mono)",
  minWidth: "224px",
  padding: "8px 12px",
  whiteSpace: "nowrap" as const,
  boxSizing: "border-box" as const,
};

// QA fix (root-caused via grep audit): confirmed there is no CSS
// `overflow: hidden` anywhere in a chart card's ancestor chain in normal
// (non-fullscreen) mode — so a tooltip rendering "cut off near a card's
// edge" isn't literally being clipped by a container boundary. Recharts'
// tooltip wrapper is a plain `position: absolute` div with no explicit
// z-index by default, so when it's positioned near/over a *neighboring*
// grid card (e.g. hovering the rightmost bar of a card, where the
// tooltip's default cursor-following offset pushes it past that card's
// own edge), it can render *behind* the next card in DOM/stacking order
// instead of on top of it — which looks identical to "getting clipped"
// but is actually a z-index stacking bug. Pass this as `wrapperStyle` (the
// outer positioned wrapper), not `contentStyle` (the inner box) — every
// chart's <Tooltip> should spread this in.
export const CHART_TOOLTIP_WRAPPER_STYLE = {
  zIndex: 50,
};

export const CHART_COLORS = {
  primary: "#6366F1",
  success: "#10B981",
  destructive: "#EF4444",
  amber: "#F59E0B",
  slate: "#64748B",
  sky: "#38BDF8",
};
