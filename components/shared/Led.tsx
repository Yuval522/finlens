import { cn } from "@/lib/utils";

/**
 * Retro-Digital redesign: replaces the old ArrowUp/ArrowDown lucide glyph
 * on every price-change badge with a small blinking/pulsing LED dot —
 * green for a gain, coral-red for a loss. See .led-dot / .led-dot-up /
 * .led-dot-down in app/globals.css for the underlying glow/pulse
 * animation (driven by the --led-up / --led-down tokens defined there).
 */
export function Led({ up, className }: { up: boolean; className?: string }) {
  return (
    <span
      className={cn("led-dot h-[7px] w-[7px]", up ? "led-dot-up" : "led-dot-down", className)}
      aria-hidden="true"
    />
  );
}
