"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";

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
 *
 * Strict Data Isolation feature: the watchlist is now tied to a logged-in
 * account (see lib/watchlist/store.ts's hydrateFromServer/resetToEmpty).
 * Toggling this while logged out would silently mutate a copy of the
 * store that's about to be wiped on the next login — instead, this opens
 * the login/signup modal so the star action actually sticks somewhere.
 */
export function WatchlistButton({ symbol, size = 16, className }: WatchlistButtonProps) {
  const { isWatched, toggle } = useWatchlist();
  const { user, ready } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const watched = isWatched(symbol);

  return (
    <>
      <button
        type="button"
        aria-pressed={watched}
        aria-label={watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
        title={ready && !user ? "Log in to add to watchlist" : watched ? "Remove from watchlist" : "Add to watchlist"}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (ready && !user) {
            setAuthOpen(true);
            return;
          }
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
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
