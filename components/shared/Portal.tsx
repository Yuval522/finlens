"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body instead of wherever this component
 * sits in the React tree.
 *
 * Fixes a real CSS bug every fixed-position modal in this app is exposed
 * to: an ancestor with `backdrop-filter` set creates a new containing
 * block for `position: fixed`/`absolute` descendants (CSS spec — same
 * trigger as `transform`/`filter`/`perspective`). This app's own
 * `.glass-card` and `.glass-panel` classes both use `backdrop-filter:
 * blur(...)` for the glassmorphism look, so any modal invoked from inside
 * one of those (e.g. the auth modal rendered from Topbar's `.glass-panel`
 * header) ends up with its "fixed to the viewport" backdrop and dialog
 * actually positioned and clipped relative to that small ancestor box
 * instead — reproducing exactly the "modal is cut off / mispositioned /
 * spills over other content, rest of the page isn't dimmed" bug reported
 * against the Log In/Sign Up modal.
 *
 * Portaling to document.body sidesteps the whole bug class regardless of
 * which glass-card/glass-panel ancestor a modal happens to be invoked
 * under, now or in the future — rather than a one-off fix for this
 * specific call site.
 *
 * Mounts nothing on the very first render (`mounted` starts false) and
 * flips true in an effect — `document` doesn't exist during server
 * rendering, and this also keeps the portal's own first client render in
 * sync with hydration instead of risking a mismatch.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
