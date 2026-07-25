"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import type { FilingRecord } from "@/lib/finance/providers/sec-edgar";

interface ReportsPanelProps {
  symbol: string;
}

const FORM_LABELS: Record<string, string> = {
  "10-K": "Annual Report",
  "10-K/A": "Annual Report (Amended)",
  "10-Q": "Quarterly Report",
  "10-Q/A": "Quarterly Report (Amended)",
  "20-F": "Annual Report (Foreign Issuer)",
  "6-K": "Interim Report (Foreign Issuer)",
};

const FORM_COLORS: Record<string, string> = {
  "10-K": "border-primary/40 bg-primary/10 text-primary",
  "20-F": "border-primary/40 bg-primary/10 text-primary",
  "10-Q": "border-sky-500/30 bg-sky-500/10 text-sky-400",
  "6-K": "border-sky-500/30 bg-sky-500/10 text-sky-400",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; filings: FilingRecord[]; companyName: string | null }
  | { status: "error" };

export function ReportsPanel({ symbol }: ReportsPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/reports/${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (!cancelled) {
          setState({ status: "ready", filings: data.filings ?? [], companyName: data.companyName ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">SEC Filings</h3>
          <p className="text-xs text-muted-foreground">
            Annual &amp; quarterly reports sourced directly from SEC EDGAR
          </p>
        </div>
      </div>

      {state.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading filings from SEC EDGAR…
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Couldn&apos;t reach SEC EDGAR right now.</p>
        </div>
      )}

      {state.status === "ready" && state.filings.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No SEC filings found for {symbol}. This is expected for symbols that aren&apos;t US-listed or
            SEC-registered (SEC EDGAR only covers filers registered with the SEC).
          </p>
        </div>
      )}

      {state.status === "ready" && state.filings.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700/80 text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">Filing Type</th>
                <th className="px-2 py-2 font-medium">Filed</th>
                <th className="px-2 py-2 font-medium">Period Ending</th>
                <th className="px-2 py-2 font-medium">Document</th>
              </tr>
            </thead>
            <tbody>
              {state.filings.map((filing) => (
                <tr
                  key={filing.accessionNumber}
                  className="border-b border-slate-800/60 transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-2 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                        FORM_COLORS[filing.form] ?? "border-slate-500/40 bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      {filing.form}
                    </span>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {FORM_LABELS[filing.form] ?? filing.form}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-foreground">{formatDate(filing.filingDate)}</td>
                  <td className="px-2 py-2.5 font-mono text-muted-foreground">{formatDate(filing.reportDate)}</td>
                  <td className="px-2 py-2.5">
                    <a
                      href={filing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View on EDGAR
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
