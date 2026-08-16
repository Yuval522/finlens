import { RobotHeadMark } from "@/components/branding/RobotHeadMark";
import { cn } from "@/lib/utils";

interface FinLensLogoProps {
  /** Emblem size in px (square). */
  size?: number;
  /** Show the "FINLENS" wordmark next to the emblem. */
  showWordmark?: boolean;
  /** Text size class applied to the wordmark, e.g. "text-[15px]". */
  wordmarkClassName?: string;
  className?: string;
}

/**
 * FinLens brand emblem — Retro-Digital redesign: the old blue/teal
 * waveform PNG (public/finlens-mark.png) is replaced with a small
 * hand-authored pixel-art robot head (see RobotHeadMark.tsx), and the
 * wordmark drops its old cyan/emerald gradient split ("Fin" + "Lens") for
 * a single flat-white, bold, monospace, all-caps "FINLENS" — matching the
 * reference logo lockup (icon directly beside plain monospace text, no
 * gradient) rather than the prior modern SaaS-style treatment.
 */
export function FinLensLogo({
  size = 28,
  showWordmark = true,
  wordmarkClassName,
  className,
}: FinLensLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <RobotHeadMark size={size} />

      {showWordmark && (
        <span
          className={cn(
            "truncate font-mono text-[15px] font-bold uppercase tracking-tight text-foreground",
            wordmarkClassName
          )}
        >
          FINLENS
        </span>
      )}
    </div>
  );
}
