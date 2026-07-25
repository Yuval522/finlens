import { cn } from "@/lib/utils";

interface FinLensLogoProps {
  /** Emblem size in px (square). */
  size?: number;
  /** Show the "Fin" + "Lens" wordmark next to the emblem. */
  showWordmark?: boolean;
  /** Text size class applied to the wordmark, e.g. "text-[15px]". */
  wordmarkClassName?: string;
  className?: string;
}

/**
 * Bespoke FinLens emblem — a focus/aperture lens ring intertwined with an
 * ascending candlestick "alpha wave" trend line, rendered as a single
 * gradient SVG (electric blue -> luminous emerald) with a soft glow.
 * Replaces the generic lucide LineChart icon that shipped in Phase 1-3.
 */
export function FinLensLogo({
  size = 32,
  showWordmark = true,
  wordmarkClassName,
  className,
}: FinLensLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: "drop-shadow(0 0 8px rgba(59,130,246,0.5))" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="finlens-emblem-gradient"
            x1="4"
            y1="36"
            x2="36"
            y2="4"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#10B981" />
          </linearGradient>
        </defs>

        {/* Focus / aperture ring */}
        <circle
          cx="20"
          cy="20"
          r="16"
          stroke="url(#finlens-emblem-gradient)"
          strokeWidth="2"
          opacity="0.9"
        />
        <circle
          cx="20"
          cy="20"
          r="16"
          stroke="url(#finlens-emblem-gradient)"
          strokeWidth="2"
          strokeDasharray="2 6"
          strokeLinecap="round"
          opacity="0.5"
          transform="rotate(20 20 20)"
        />

        {/* Ascending candlesticks — the "alpha wave" */}
        <g stroke="url(#finlens-emblem-gradient)" strokeWidth="1.6" strokeLinecap="round">
          <line x1="12" y1="29" x2="12" y2="22" />
          <line x1="18" y1="25" x2="18" y2="15" />
          <line x1="24" y1="19" x2="24" y2="9" />
        </g>
        <g fill="url(#finlens-emblem-gradient)">
          <rect x="10.5" y="24" width="3" height="4" rx="0.75" />
          <rect x="16.5" y="17" width="3" height="6" rx="0.75" />
          <rect x="22.5" y="11" width="3" height="6" rx="0.75" />
        </g>

        {/* Trend arrowhead breaking out of the ring, top-right */}
        <path
          d="M26 12 L30 8 M30 8 H26.5 M30 8 V11.5"
          stroke="url(#finlens-emblem-gradient)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {showWordmark && (
        <span className={cn("truncate text-[15px] font-semibold tracking-tight", wordmarkClassName)}>
          <span className="font-extrabold text-white">Fin</span>
          <span className="brand-gradient-text font-extrabold">Lens</span>
        </span>
      )}
    </div>
  );
}
