import { RobotHeadMark } from "@/components/branding/RobotHeadMark";
import { cn } from "@/lib/utils";

interface StoxLogoProps {
  /** Emblem size in px (square). */
  size?: number;
  /** Show the "STOX" wordmark next to the emblem. */
  showWordmark?: boolean;
  /** Text size class applied to the wordmark, e.g. "text-[15px]". */
  wordmarkClassName?: string;
  className?: string;
}

/**
 * Stox brand emblem — Retro-Digital redesign: the old blue/teal
 * waveform PNG (public/finlens-mark.png, kept on disk as a legacy leftover
 * — not referenced anywhere in current metadata) is replaced with a small
 * hand-authored pixel-art robot head (see RobotHeadMark.tsx), and the
 * wordmark drops its old cyan/emerald gradient split for a single
 * flat-white, bold, monospace, all-caps "STOX" — matching the reference
 * logo lockup (icon directly beside plain monospace text, no gradient)
 * rather than the prior modern SaaS-style treatment.
 *
 * QA fix (Stox rebrand): renamed from FinLensLogo.tsx / FinLensLogo — this
 * is the same component, same file location convention
 * (components/branding/), just renamed in lockstep with the product name.
 * See components/layout/Topbar.tsx and Sidebar.tsx for the two import
 * sites that were updated alongside this rename.
 */
export function StoxLogo({
  size = 28,
  showWordmark = true,
  wordmarkClassName,
  className,
}: StoxLogoProps) {
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
          STOX
        </span>
      )}
    </div>
  );
}
