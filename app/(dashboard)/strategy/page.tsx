"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";
import { formatPrice, formatPercent, formatMarketCap, changeDirection } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { ParsedStrategy, StrategyResultRow } from "@/lib/strategy/types";

/**
 * Natural Language Strategy Builder — free-text input (English/Hebrew) ->
 * POST /api/strategy -> Claude-parsed filter spec + live screening results.
 * The "generated filtering logic" panel is deliberately shown BEFORE the
 * results table, always, even on a strategy with zero matches — this is
 * what lets a user tell "the model misunderstood me" apart from "the model
 * understood correctly, nothing in the universe currently qualifies".
 */

const EXAMPLE_QUERIES = [
  "Large cap tech stocks with RSI under 30",
  "Dividend yield over 3% and P/E under 20",
  "מניות עם שווי שוק מעל 50 מיליארד דולר שעלו היום",
];

interface StrategyResponse {
  parsed: ParsedStrategy;
  results: StrategyResultRow[];
  universeSize: number;
  error?: string;
}

export default function StrategyBuilderPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<StrategyResponse | null>(null);

  async function runStrategy(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as StrategyResponse;
      if (!res.ok) {
        setError(body.error ?? "Something went wrong running that strategy.");
        setResponse(null);
        return;
      }
      setResponse(body);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Strategy Builder</h1>
          <p className="text-xs text-muted-foreground">
            Describe a screening strategy in plain English or Hebrew — we&apos;ll turn it into filters and run it live.
          </p>
        </div>
      </div>

      {/* Query input */}
      <div className="glass-card space-y-3 rounded-xl p-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runStrategy(query);
          }}
          placeholder="e.g. Tech stocks under $50 with RSI below 30, sorted by market cap"
          dir="auto"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  runStrategy(ex);
                }}
                dir="auto"
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => runStrategy(query)}
            disabled={loading || query.trim().length === 0}
            className="flex min-h-9 items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? "Running…" : "Run strategy"}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card flex items-start gap-2 rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {response && (
        <>
          {/* Generated filtering logic — transparency panel, shown regardless of result count */}
          <div className="glass-card space-y-3 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What we understood
              </h2>
              {response.parsed.mock && (
                <span
                  title="ANTHROPIC_API_KEY isn't configured — filters below were matched by a local keyword parser, not by Claude."
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400"
                >
                  <Sparkles className="h-3 w-3" />
                  Offline demo mode
                </span>
              )}
            </div>
            <p dir="auto" className="text-sm text-foreground">
              {response.parsed.explanation || "No explanation returned."}
            </p>
            {response.parsed.mock && (
              <p className="text-xs text-muted-foreground">
                No live Anthropic API key is configured, so this ran through a simplified local keyword matcher
                instead of Claude — good enough to try the interface, but it won&apos;t understand phrasing the
                real model would. Add <code className="font-mono">ANTHROPIC_API_KEY</code> to enable full natural
                language parsing.
              </p>
            )}
            {response.parsed.filters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {response.parsed.filters.map((f, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                  >
                    {f.metric} {OPERATOR_LABEL[f.operator]} {f.value}
                  </span>
                ))}
                {response.parsed.sortBy && (
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    sort: {response.parsed.sortBy} {response.parsed.sortDirection}
                  </span>
                )}
              </div>
            )}
            {response.parsed.unsupported && response.parsed.filters.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No filters could be applied — try rephrasing with a specific metric (price, market cap, P/E,
                dividend yield, RSI, moving averages, volume, or today&apos;s % change).
              </p>
            )}
          </div>

          {/* Results */}
          {response.results.length > 0 && (
            <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
              <p className="mb-2 px-1 text-xs text-muted-foreground">
                {response.results.length} match{response.results.length === 1 ? "" : "es"} out of{" "}
                {response.universeSize} screened stocks
              </p>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/80 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Name</th>
                      <th className="px-2 py-2 text-right font-medium">Price</th>
                      <th className="px-2 py-2 text-right font-medium">Change %</th>
                      <th className="px-2 py-2 text-right font-medium">Market Cap</th>
                      <th className="px-2 py-2 text-right font-medium">P/E</th>
                      <th className="px-2 py-2 text-right font-medium">Div Yield</th>
                      <th className="px-2 py-2 text-right font-medium">RSI-14</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((row) => (
                      <StrategyRow key={row.symbol} row={row} onClick={() => router.push(`/analysis/${row.symbol}`)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {response.results.length === 0 && !response.parsed.unsupported && (
            <div className="glass-card flex flex-col items-center justify-center gap-2 rounded-xl py-16 text-center">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No stocks in the screening universe currently match.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const OPERATOR_LABEL: Record<string, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
};

function StrategyRow({ row, onClick }: { row: StrategyResultRow; onClick: () => void }) {
  const direction = changeDirection(row.changePercent);
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-slate-800/60 transition-colors last:border-0 hover:bg-accent/60"
    >
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <CompanyLogo symbol={row.symbol} name={row.name} size={22} />
          <div className="min-w-0">
            <div className="font-mono font-semibold text-foreground">{row.symbol}</div>
            <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">{row.name}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-foreground">{formatPrice(row.price, "USD")}</td>
      <td className="px-2 py-2.5 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono font-medium",
            direction === "up" && "text-success",
            direction === "down" && "text-destructive"
          )}
        >
          {direction === "up" && <ArrowUp className="h-3 w-3" />}
          {direction === "down" && <ArrowDown className="h-3 w-3" />}
          {formatPercent(row.changePercent)}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-foreground">{formatMarketCap(row.marketCap, "USD")}</td>
      <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
        {row.peRatio == null ? "—" : `${row.peRatio.toFixed(1)}x`}
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
        {row.dividendYieldPercent == null ? "—" : `${row.dividendYieldPercent.toFixed(2)}%`}
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
        {row.rsi14 == null ? "—" : row.rsi14.toFixed(0)}
      </td>
    </tr>
  );
}
