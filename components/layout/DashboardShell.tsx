"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    // QA fix (root-caused via live DevTools inspection while chasing a
    // "sticky profile card disappears on scroll" report): this was
    // `min-h-screen`, a *minimum* height that lets the container grow
    // taller than the viewport to fit tall content. That meant `<main>`'s
    // `flex-1` had no fixed height to actually flex within — its box just
    // grew to match its own content, so `overflow-y-auto` never had
    // anything to scroll internally, and the browser fell back to
    // scrolling the outer window/body instead. `position: sticky` inside
    // `<main>` computes its stuck offset relative to `<main>` as the
    // nearest scrolling ancestor — but since `<main>` itself never
    // actually scrolled (its own scrollTop stayed 0 while the window
    // scrolled), sticky never engaged; it just scrolled away with the
    // page. `h-screen` (an exact, not minimum, viewport-height box) makes
    // `<main>`'s `flex-1` resolve to a real bounded height, so its own
    // overflow-y-auto genuinely engages as the true internal scroll
    // container — confirmed live: sticky content now stays pinned while
    // scrolling instead of disappearing.
    //
    // .app-ambient-glow (see app/globals.css): a subtle warm-orange radial
    // wash applied here, at the one root element every route in
    // app/(dashboard)/* renders into, so every page gets the ambient glow
    // rather than only the two pages that separately opt into the
    // stronger .hig-bg on their own content wrapper.
    <div className="app-ambient-glow flex h-screen bg-background">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
