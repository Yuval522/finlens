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
 * dragging the shadow along as a gray smudge. Also used, composited onto a
 * solid #1A1A1A panel at square app-icon sizes, for app/icon.png (favicon)
 * and app/apple-icon.png — see app/layout.tsx.
 *
 * QA fix (live report: home-screen icon showed the glyph small and boxed
 * in with the OS's own white/dark framing around it, vs. a native app icon
 * like Gemini's that reads edge-to-edge). The favicon/apple-touch-icon and
 * manifest.json's purpose:"any" icons (public/icons/icon-192-any.png,
 * icon-512-any.png) are now composited full-bleed — glyph at 80% of canvas
 * width, since neither iOS nor a plain "any" manifest icon crops the
 * source at all (they only round the corners), so there's no reason to
 * hold back the same safe-zone shrink Android's maskable format needs.
 * manifest.json's separate purpose:"maskable" entries
 * (icon-192-maskable.png, icon-512-maskable.png) keep the smaller ~62%
 * width scale — maskable icons CAN be cropped to a circle/squircle/etc by
 * the OS, so content has to stay inside that inner safe zone or risk being
 * clipped. See manifest.json.
 */
