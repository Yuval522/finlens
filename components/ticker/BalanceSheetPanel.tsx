"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BalanceSheetYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactAxis } from "@/lib/format/chart";
import { ChartCard } from "./ChartCard";

interface BalanceSheetPanelProps {
  balance: BalanceSheetYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, destructive: DESTRUCTIVE, sky: SKY } = CHART_COLORS;

export function BalanceSheetPanel({ balance, currency }: BalanceSheetPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  const moneyTooltip = (value: unknown) => `${compactAxis(Number(value))} ${currency}`;

  return (
    // Phase 5: 3-column breakdown (Short-Term Position / Total Structure /
    // Debt vs Liquidity), replacing the earlier 2-chart layout.
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
      <ChartCard
        title="Short-Term Position"
        subtitle="Cash & ST Investments vs Current Assets vs Current Liabilities"
        fullscreen={expanded === "short-term"}
        onToggleFullscreen={() => toggle("short-term")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={balance} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactAxis} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={moneyTooltip}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="cashAndShortTermInvestments"
              name="Cash & ST Investments"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              dataKey="totalCurrentAssets"
              name="Total Current Assets"
              fill={SKY}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              dataKey="totalCurrentLiabilities"
              name="Total Current Liabilities"
              fill={DESTRUCTIVE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Total Structure"
        subtitle="Assets vs Liabilities vs Equity"
        fullscreen={expanded === "structure"}
        onToggleFullscreen={() => toggle("structure")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={balance} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactAxis} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={moneyTooltip}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalAssets" name="Total Assets" fill={SKY} radius={[4, 4, 0, 0]} animationDuration={600} />
            <Bar
              dataKey="totalLiabilities"
              name="Total Liabilities"
              fill={DESTRUCTIVE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              dataKey="totalStockholdersEquity"
              name="Stockholders' Equity"
              fill={PRIMARY}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Debt vs Liquidity"
        subtitle="Total Debt vs Cash & ST Investments"
        fullscreen={expanded === "debt-liquidity"}
        onToggleFullscreen={() => toggle("debt-liquidity")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={balance} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactAxis} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={moneyTooltip}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalDebt" name="Total Debt" fill={DESTRUCTIVE} radius={[4, 4, 0, 0]} animationDuration={600} />
            <Bar
              dataKey="cashAndShortTermInvestments"
              name="Cash & ST Investments"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
