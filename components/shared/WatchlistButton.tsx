"use client";

import { Star } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";

interface WatchlistButtonProps {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Star/bookmark toggle shared by the ticker header and search result rows.
 * Always calls stopPropagation/preventDefault first — every place this gets
 * used sits inside a larger clickable element (a Link card, a select-on-
 * mousedown search row), and toggling the watchlist should never also
 * trigger that outer navigation.
 */
export function WatchlistButton({ symbol, size = 16, className }: WatchlistButtonProps) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(symbol);

  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(symbol);
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors",
        watched
          ? "text-amber-400 hover:text-amber-300"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      <Star className="transition-transform" style={{ width: size, height: size }} fill={watched ? "currentColor" : "none"} />
    </button>
  );
}
