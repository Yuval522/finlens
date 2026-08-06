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
const MARK_NATIVE_WIDTH = 201;
const MARK_NATIVE_HEIGHT = 132;

/**
 * FinLens brand emblem — the 2026 rebrand's blue-to-teal waveform/pulse
 * icon, lifted from public/finlens-mark.png. The source file ships as a
 * flattened lockup (icon + "finlens" wordmark + tagline centered on an
 * opaque dark-charcoal panel); the icon alone was isolated onto a
 * transparent background so it reads correctly on this app's dark theme
 * instead of showing a solid rectangle. See public/finlens-mark.png
 * provenance note below the component. The "FinLens" wordmark stays as
 * crisp gradient text (rather than rasterizing the source artwork's own
 * wordmark) so it stays legible at nav-bar sizes and matches the app's
 * cyan/emerald brand gradient.
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
 * 1024x559 logo lockup (waveform/pulse icon + "finlens" wordmark + "Intuitive
 * & Fast" tagline, centered on an opaque dark-charcoal panel). The icon
 * alone was isolated by comparing the source against a heavily blurred
 * copy of itself (the blur estimates the panel's own smooth vignette while
 * washing out its fine brushed-texture grain) and keeping only pixels
 * BRIGHTER than that local background — the icon's blue/teal gradient
 * glyph is brighter than its surroundings, while the artwork's soft drop
 * shadow beneath the icon is darker, so this signed comparison (rather
 * than a plain color-distance threshold) keeps the glyph crisp without
 * dragging the shadow along as a gray smudge. Also used, at square
 * app-icon sizes on a solid #1A1A1A panel, for public/icons/icon-192.png,
 * public/icons/icon-512.png, app/icon.png (favicon), and app/apple-icon.png
 * — see manifest.json and app/layout.tsx.
 */
