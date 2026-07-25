import Image from "next/image";
import { cn } from "@/lib/utils";

interface FinLensLogoProps {
  /** Emblem size in px (height — width follows the mark's native aspect ratio). */
  size?: number;
  /** Show the "Fin" + "Lens" wordmark next to the emblem. */
  showWordmark?: boolean;
  /** Text size class applied to the wordmark, e.g. "text-[15px]". */
  wordmarkClassName?: string;
  className?: string;
}

// Native asset dimensions (public/finlens-mark.png) — used to keep the
// emblem's aspect ratio correct at any requested `size`.
const MARK_NATIVE_WIDTH = 291;
const MARK_NATIVE_HEIGHT = 269;

/**
 * FinLens brand emblem — the user's uploaded logo artwork (a chrome
 * magnifying glass over an ascending candlestick pattern), lifted from
 * public/finlens-mark.png. The source file ships as a large flattened
 * mockup (icon + outlined wordmark on an opaque brushed-metal panel);
 * the icon alone was isolated onto a transparent background so it reads
 * correctly on this app's dark slate theme instead of showing a gray box.
 * See public/finlens-mark.png provenance note below the component.
 * The "FinLens" wordmark stays as crisp gradient text (rather than the
 * source file's embossed outline text) so it stays legible at nav-bar
 * sizes and matches the app's cyan/emerald brand gradient.
 */
export function FinLensLogo({
  size = 32,
  showWordmark = true,
  wordmarkClassName,
  className,
}: FinLensLogoProps) {
  const width = Math.round((size * MARK_NATIVE_WIDTH) / MARK_NATIVE_HEIGHT);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/finlens-mark.png"
        alt="FinLens"
        width={width}
        height={size}
        priority
        style={{ filter: "drop-shadow(0 0 6px rgba(59,130,246,0.35))" }}
        className="shrink-0"
      />

      {showWordmark && (
        <span className={cn("truncate text-[15px] font-semibold tracking-tight", wordmarkClassName)}>
          <span className="font-extrabold text-white">Fin</span>
          <span className="brand-gradient-text font-extrabold">Lens</span>
        </span>
      )}
    </div>
  );
}

/**
 * Provenance: public/finlens-mark.png was derived from the user-uploaded
 * logo.png (a 1536x1024 mockup render — icon + outlined wordmark centered
 * on an opaque brushed-metal gradient panel). The icon was isolated via
 * local-contrast edge detection + enclosed-region fill (not simple color
 * keying, since the icon's own chrome tones are close to the background
 * gray) to produce a clean transparent-background PNG suitable for a dark
 * UI. The original upload is left untouched at the project root
 * (logo.png) for reference.
 */
