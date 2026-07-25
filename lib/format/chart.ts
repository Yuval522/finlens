/** Shared Recharts helpers for the ticker analysis tabs (Income, Balance, ...). */

export function compactAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(0)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return `${value}`;
}

// QA hotfix (Final Polish pass): values like "Cash & ST Investments: 55B
// USD" were getting clipped at the tooltip's right edge — Recharts' default
// tooltip box sizes to its content but without an explicit minimum width,
// a long label + value + currency suffix combination can render tighter
// than expected on some viewport/zoom combinations. minWidth + nowrap (so
// the box grows instead of wrapping awkwardly) plus generous padding fixes
// this without needing to drop the currency suffix.
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#0f1420",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "0.5rem",
  fontSize: "12px",
  fontFamily: "var(--font-mono)",
  minWidth: "200px",
  padding: "8px 12px",
  whiteSpace: "nowrap" as const,
};

export const CHART_COLORS = {
  primary: "#6366F1",
  success: "#10B981",
  destructive: "#EF4444",
  amber: "#F59E0B",
  slate: "#64748B",
  sky: "#38BDF8",
};
