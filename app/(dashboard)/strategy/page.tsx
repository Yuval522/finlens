"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";
import { formatPrice, formatPercent, formatMarketCap, changeDirection } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { ParsedStrategy, StrategyMetric, StrategyResultRow } from "@/lib/strategy/types";
import { STRATEGY_METRIC_LABELS, STRATEGY_OPERATOR_LABELS } from "@/lib/strategy/format";

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

/**
 * Assisted input: one insertable natural-language snippet per supported
 * StrategyMetric (lib/strategy/types.ts), phrased to map cleanly onto the
 * closed-vocabulary parser (lib/strategy/parse.ts / mock-parse.ts) — this
 * is the "guide users toward phrasing that maps cleanly" half of the
 * Strategy Builder v2 upgrade; the filter chips shown after a run
 * (STRATEGY_METRIC_LABELS below) are the "confirm what was understood"
 * half.
 */
const METRIC_HINTS: { metric: StrategyMetric; snippet: string }[] = [
  { metric: "marketCap", snippet: "market cap over $10 billion" },
  { metric: "peRatio", snippet: "P/E under 20" },
  { metric: "dividendYieldPercent", snippet: "dividend yield over 3%" },
  { metric: "rsi14", snippet: "RSI below 30" },
  { metric: "priceVsSma50", snippet: "above its 50-day average" },
  { metric: "priceVsSma200", snippet: "above its 200-day average" },
  { metric: "changePercent", snippet: "up more than 5% today" },
  { metric: "price", snippet: "priced under $50" },
  { metric: "volume", snippet: "volume over 5 million" },
];

interface StrategyResponse {
  parsed: ParsedStrategy;
  results: StrategyResultRow[];
  universeSize: number;
  relaxed?: boolean;
  relaxedNote?: string | null;
  dataAsOf?: number | null;
  error?: string;
}

/** Coarse "how stale is this" label for StrategyRunResult.dataAsOf — precomputed rows are only as fresh as the last refresh cron run (see lib/strategy/universe-refresh.ts), so this is deliberately approximate rather than a live-updating clock. */
function formatDataAge(epochMs: number): string {
  const minutes = Math.round((Date.now() - epochMs) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function StrategyBuilderPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<StrategyResponse | null>(null);

  function insertHint(snippet: string) {
    setQuery((prev) => {
      const trimmed = prev.trim();
      return trimmed.length === 0 ? snippet.charAt(0).toUpperCase() + snippet.slice(1) : `${trimmed} and ${snippet}`;
    });
  }

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
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wand2 className="h-3 w-3" />
            Add a filter:
          </span>
          {METRIC_HINTS.map(({ metric, snippet }) => (
            <button
              key={metric}
              type="button"
              onClick={() => insertHint(snippet)}
              title={`Insert: "${snippet}"`}
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {STRATEGY_METRIC_LABELS[metric]}
            </button>
          ))}
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
                    {STRATEGY_METRIC_LABELS[f.metric]} {STRATEGY_OPERATOR_LABELS[f.operator]} {f.value}
                  </span>
                ))}
                {response.parsed.sortBy && (
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    sort: {STRATEGY_METRIC_LABELS[response.parsed.sortBy]} {response.parsed.sortDirection}
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

          {/* Relaxed/near-miss banner — shown ONLY when the strict query matched nothing and
              execute.ts fell back to closest-match scoring (see StrategyRunResult.relaxed). This
              must read as clearly distinct from a normal result set, never blended in silently. */}
          {response.relaxed && (
            <div className="glass-card flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{response.relaxedNote ?? "No exact matches — showing the closest stocks instead."}</span>
            </div>
          )}

          {/* Results */}
          {response.results.length > 0 && (
            <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
              <p className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
                <span>
                  {response.relaxed
                    ? `${response.results.length} closest match${response.results.length === 1 ? "" : "es"}`
                    : `${response.results.length} match${response.results.length === 1 ? "" : "es"} out of ${response.universeSize} screened stocks`}
                </span>
                {response.dataAsOf != null && <span>Data as of {formatDataAge(response.dataAsOf)}</span>}
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
                      {response.relaxed && <th className="px-2 py-2 text-left font-medium">Why it&apos;s close</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((row) => (
                      <StrategyRow
                        key={row.symbol}
                        row={row}
                        showAlmostMatchNote={Boolean(response.relaxed)}
                        onClick={() => router.push(`/analysis/${row.symbol}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {response.results.length === 0 && !response.parsed.unsupported && (
            <div className="glass-card flex flex-col items-center justify-center gap-2 rounded-xl py-16 text-center">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No stocks in the screening universe have enough data to evaluate this strategy right now.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StrategyRow({
  row,
  showAlmostMatchNote,
  onClick,
}: {
  row: StrategyResultRow;
  showAlmostMatchNote: boolean;
  onClick: () => void;
}) {
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
      {showAlmostMatchNote && (
        <td className="max-w-[220px] px-2 py-2.5 text-left text-[11px] text-amber-400/90" title={row.almostMatchNote ?? undefined}>
          <span className="line-clamp-2">{row.almostMatchNote ?? "—"}</span>
        </td>
      )}
    </tr>
  );
}
