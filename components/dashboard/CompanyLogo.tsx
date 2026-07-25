"use client";

import { useState } from "react";

interface CompanyLogoProps {
  symbol: string;
  name: string;
  /** Pixel size of the (square, circular) avatar. */
  size?: number;
}

/** Deterministic-but-varied accent color per symbol, so fallback badges aren't all identically gray. */
const BADGE_PALETTE = [
  "bg-blue-500/15 text-blue-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-purple-500/15 text-purple-300",
  "bg-rose-500/15 text-rose-300",
  "bg-cyan-500/15 text-cyan-300",
];

function badgeColorFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  return BADGE_PALETTE[Math.abs(hash) % BADGE_PALETTE.length];
}

/**
 * Strips exchange suffixes (".TA", ".L", ...) down to the bare ticker that
 * logo CDNs index by, e.g. "TEVA.TA" -> "TEVA". Left as-is for symbols with
 * no suffix.
 */
function bareTicker(symbol: string): string {
  const dot = symbol.indexOf(".");
  return dot === -1 ? symbol : symbol.slice(0, dot);
}

/**
 * Fallback initials badge — mirrors the reference terminal's own behavior
 * for instruments with no resolvable logo (indices, some illiquid tickers):
 * "^GSPC" -> "^G", "^TA125.TA" -> "^T", a plain equity/ETF falls back to the
 * first letter of its display name (e.g. "Nokia Oyj" -> "N").
 */
function fallbackInitials(symbol: string, name: string): string {
  if (symbol.startsWith("^")) {
    const firstLetter = symbol.slice(1).match(/[A-Za-z]/)?.[0] ?? "?";
    return `^${firstLetter.toUpperCase()}`;
  }
  return name.trim().charAt(0).toUpperCase() || symbol.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Company/instrument logo avatar for dashboard quote cards (Market Summary,
 * Most Active). Tries FMP's public logo image CDN (keyless — just a static
 * image path per bare ticker, the same provider already used elsewhere in
 * this project — see lib/finance/providers/fmp.ts) and falls back to a
 * colored initials badge on load failure, exactly like the reference
 * terminal does for indices and other logo-less instruments. This request
 * happens client-side in the end user's own browser (not this app's
 * server), so it isn't affected by this sandbox's server-side network
 * restrictions — unverified live here, same documented caveat as every
 * other network-dependent feature in this project, but there's nothing
 * server-side that could fail differently in production.
 */
export function CompanyLogo({ symbol, name, size = 36 }: CompanyLogoProps) {
  const isIndex = symbol.startsWith("^");
  const [failed, setFailed] = useState(isIndex);

  if (failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${badgeColorFor(symbol)}`}
        style={{ height: size, width: size }}
        aria-hidden="true"
      >
        {fallbackInitials(symbol, name)}
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/95 ring-1 ring-slate-800/60"
      style={{ height: size, width: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external, per-symbol CDN image; next/image's domain allowlist isn't worth the config churn for a best-effort fallback-prone avatar */}
      <img
        src={`https://images.financialmodelingprep.com/symbol/${encodeURIComponent(bareTicker(symbol))}.png`}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain p-1"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
