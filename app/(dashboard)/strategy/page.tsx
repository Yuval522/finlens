"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Led } from "@/components/shared/Led";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";
import { formatPrice, formatPercent, changeDirection } from "@/lib/format/currency";
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

/**
 * QA fix: replaced the old 9-chip "insert a metric snippet" row + separate
 * "Try:" example-queries row + Hebrew example (three stacked rows, wrapping
 * across 2-3 lines) with exactly the 5 named quick-strategy presets shown
 * in the reference design. Each is a complete, ready-to-run natural-
 * language query (not a fragment to append), so clicking one behaves like
 * clicking an example query: it replaces the box's contents and runs
 * immediately — see PRESET_PILLS / handlePresetClick below.
 */
const PRESET_PILLS: { label: string; query: string }[] = [
  { label: "Large Cap", query: "Large cap stocks with market cap over $10 billion" },
  { label: "Low RSI (Oversold)", query: "Stocks with RSI below 30" },
  { label: "Dividend Payers", query: "Stocks with dividend yield over 3%" },
  { label: "Tech Sector", query: "Tech sector stocks" },
  { label: "P/E < 20", query: "Stocks with P/E under 20" },
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
  // Which PRESET_PILLS label (if any) produced the query currently in the
  // box — drives the glowing "active" pill state. Cleared as soon as the
  // user hand-edits the box, so the glow never lies about what's shown.
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function handlePresetClick(label: string, presetQuery: string) {
    setActivePreset(label);
    setQuery(presetQuery);
    runStrategy(presetQuery);
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
      {/* QA fix: reference header has no icon badge above it, a larger bold
          H1 reading "Describe your strategy", and a short one-line
          subtitle — dropped the icon and the Hebrew-support callout to
          match exactly. */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold text-foreground">Describe your strategy</h1>
        <p className="text-sm text-muted-foreground">Plain English in, live market results out.</p>
      </div>

      {/* Query input — Retro-Digital redesign: single-line "$" command pill
          (matching the reference terminal-style search bar) instead of the
          old multi-row textarea with a separate button below it. */}
      <div className="space-y-3">
        {/* QA fix: both the shell and the Run button were rounded-full
            (full stadium/pill) — corner-pixel comparison against the
            reference showed a moderate ~16-20px rounded-rectangle instead,
            with visible straight top/bottom edges, plus dark (not white)
            text on the coral Run button. rounded-2xl/rounded-xl below, and
            text-black on the button (a local override, not a change to the
            shared --primary-foreground token, since that token is also
            used for white-on-primary elements elsewhere like the Topbar
            avatar badge). */}
        <div className="flex items-center gap-3 rounded-2xl border border-primary/60 bg-card px-5 py-3.5 shadow-[0_0_28px_-6px] shadow-primary/50 transition-shadow focus-within:shadow-primary/80">
          <span className="shrink-0 font-mono text-base text-primary">$</span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActivePreset(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") runStrategy(query);
            }}
            placeholder="e.g. Tech stocks under $50 with RSI below 30, sorted by market cap"
            dir="auto"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => runStrategy(query)}
            disabled={loading || query.trim().length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-mono text-sm font-bold text-black transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Run <span aria-hidden="true">↵</span>
              </>
            )}
          </button>
        </div>

        {/* Preset pills — exactly the 5 named quick-strategy presets from
            the reference, one row, no "Try:" label or Hebrew example
            underneath. The glowing orange border marks whichever preset
            produced the query currently shown above. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PRESET_PILLS.map(({ label, query: presetQuery }) => {
            const active = activePreset === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handlePresetClick(label, presetQuery)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_-2px] shadow-primary/70"
                    : "border-border/80 bg-white/[0.02] text-muted-foreground hover:border-primary/60 hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
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
          {/* QA fix: removed the "What we understood" transparency panel
              (parsed-filter chips + offline-demo-mode badge) — the
              reference layout goes straight from the pills to the warning
              banner/results table with nothing in between. The underlying
              response.parsed data (explanation, filters, mock flag) is
              still fetched and available on `response` if this needs to
              come back later; only the render was removed here. */}

          {/* Relaxed/near-miss banner — shown ONLY when the strict query matched nothing and
              execute.ts fell back to closest-match scoring (see StrategyRunResult.relaxed). This
              must read as clearly distinct from a normal result set, never blended in silently.
              QA fix: reference shows a bold coral title ("No exact matches") with a separate
              muted subtitle line below it, not one flat sentence — and the accent is the brand
              primary orange-coral, not a separate amber/yellow hue. */}
          {response.relaxed && (
            <div className="glass-card flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-primary">No exact matches</p>
                <p className="text-sm text-muted-foreground">
                  {response.relaxedNote ?? "No stocks matched every condition exactly — showing the closest matches instead."}
                </p>
              </div>
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
                {/* QA fix: reference header row is uppercase with tracked-out
                    letter-spacing (NAME / PRICE / CHANGE % / ...), has no
                    Market Cap column, and separates "Why it's close" with a
                    dotted vertical divider rather than just more spacing. */}
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 text-right font-medium">Price</th>
                      <th className="px-2 py-1.5 text-right font-medium">Change %</th>
                      <th className="px-2 py-1.5 text-right font-medium">P/E</th>
                      <th className="px-2 py-1.5 text-right font-medium">Div Yield</th>
                      <th className="px-2 py-1.5 text-right font-medium">RSI-14</th>
                      {response.relaxed && (
                        // QA fix: this header inherited text-muted-foreground
                        // from the parent <tr> like every other column, but
                        // the reference design shows it colored — distinct
                        // from the gray NAME/PRICE/etc. headers, signaling
                        // it's a different kind of column (an explanation,
                        // not a data field). Originally used text-primary,
                        // but a live report correctly flagged that as too
                        // neon/competing with the app's one true brand
                        // accent — switched to --warning, a deliberately
                        // softer, more muted burnt-amber in the same hue
                        // family (see globals.css doc comment on that
                        // token). border-b-2 border-dotted border-warning
                        // gives this cell its own dotted underline in place
                        // of the row's shared solid border-b, at the same
                        // vertical position as every other header's
                        // underline (border-collapse: the more specific/
                        // heavier per-cell border wins over the tr's), same
                        // technique as the Portfolio table's fork header.
                        // QA fix: left divider is now warning-colored
                        // (previously neutral border-border/70 like every
                        // other column's plain gray divider) and continues
                        // all the way down through every data row below
                        // (see the matching border-l border-warning on the
                        // <td> in StrategyRow), instead of stopping at the
                        // header — one continuous vertical line for the
                        // whole column's height. A 3-sided top+left+bottom
                        // bracket was tried and reverted per feedback: the
                        // top edge should stay open/clean, only left+bottom
                        // are boxed.
                        <th className="border-l border-b-2 border-dotted border-warning px-2 py-1.5 pl-3 text-left font-medium text-warning">
                          Why it&apos;s close
                        </th>
                      )}
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
      className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-accent/60"
    >
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <CompanyLogo symbol={row.symbol} name={row.name} size={22} />
          <div className="min-w-0">
            <div className="font-mono font-semibold text-foreground">{row.symbol}</div>
            <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">{row.name}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-right font-mono text-foreground">{formatPrice(row.price, "USD")}</td>
      <td className="px-2 py-2 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono font-medium",
            direction === "up" && "text-success",
            direction === "down" && "text-destructive"
          )}
        >
          {direction !== "flat" && <Led up={direction === "up"} />}
          {formatPercent(row.changePercent)}
        </span>
      </td>
      <td className="px-2 py-2 text-right font-mono text-muted-foreground">
        {row.peRatio == null ? "—" : `${row.peRatio.toFixed(1)}x`}
      </td>
      <td className="px-2 py-2 text-right font-mono text-muted-foreground">
        {row.dividendYieldPercent == null ? "—" : `${row.dividendYieldPercent.toFixed(2)}%`}
      </td>
      <td className="px-2 py-2 text-right font-mono text-muted-foreground">
        {row.rsi14 == null ? "—" : row.rsi14.toFixed(0)}
      </td>
      {showAlmostMatchNote && (
        // QA fix: matches the header's text-primary -> text-warning switch
        // (see the "Why it's close" <th> doc comment above) — same softer
        // burnt-amber for the row text, not just the header, per the
        // report that the full-brightness coral read too neon here. The
        // left divider also switched from neutral border-border/70 to
        // border-warning so it continues the header's dotted orange line
        // all the way down through every row instead of stopping at the
        // header — one unbroken vertical line for the column's full height.
        <td
          className="max-w-[220px] border-l border-dotted border-warning px-2 py-2 pl-3 text-left text-[11px] text-warning/90"
          title={row.almostMatchNote ?? undefined}
        >
          <span className="line-clamp-2">{row.almostMatchNote ?? "—"}</span>
        </td>
      )}
    </tr>
  );
}
