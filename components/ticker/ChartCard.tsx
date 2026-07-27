"use client";

import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";

/**
 * Shared single-chart glass card used across the Income/Balance/Cash Flow
 * tabs — was previously duplicated verbatim in IncomeStatementPanel and
 * BalanceSheetPanel (Phase 5 rebuild consolidates it here since the tab
 * count doubled and inline duplication was getting out of hand).
 */
export function ChartCard({
  title,
  subtitle,
  children,
  fullscreen,
  onToggleFullscreen,
  className = "",
  height = "h-64",
  controls,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  className?: string;
  height?: string;
  /**
   * QA fix (screenshot comparison against the reference terminal's
   * expanded-chart modal): fullscreen used to show nothing but a title and
   * a collapse icon, missing the reference's Select Range / View / Chart
   * Type dropdowns. Rendered only in fullscreen, directly below the title
   * row — callers pass whatever real, data-backed controls apply to their
   * specific dataset (see IncomeStatementPanel/BalanceSheetPanel/
   * CashFlowPanel for the shared <ChartControls> they build these from).
   */
  controls?: React.ReactNode;
}) {
  // QA fix (modal positioning/sizing bug): the fullscreen overlay used to
  // render inline, as a normal descendant of whatever tab panel it lives
  // in (e.g. IncomeStatementPanel's chart grid, itself nested inside
  // DataExplorerTabs' `.glass-card` wrapper). `.glass-card` sets
  // `backdrop-filter: blur(20px)` — and per the CSS spec, `backdrop-filter`
  // (like `filter`/`transform`/`perspective`/`will-change: transform`)
  // creates a new containing block for any `position: fixed` DESCENDANT.
  // So this card's `fixed inset-4` was never actually measured against the
  // *viewport* — it was measured against the nearest `.glass-card`
  // ancestor's box, which for a tab panel with 8 stacked chart cards can
  // easily be 2,000px+ tall. `inset-4` relative to *that* box positions the
  // "modal" somewhere inside that huge scrollable area instead of centered
  // in the viewport, pushing most of it off-screen. Rendering the overlay
  // through a portal straight onto `document.body` sidesteps the whole
  // problem: it's no longer a descendant of any blurred/transformed
  // ancestor, so `fixed` resolves against the real viewport every time,
  // regardless of how deep in the tree the triggering ChartCard lives.
  const cardBody = (
    <>
      <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={fullscreen ? "Collapse" : "Expand"}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {fullscreen && controls && <div className="mb-3 shrink-0">{controls}</div>}
      {/*
        QA fix (confirmed live via the comparison audit): fullscreen used
        to give the outer card a viewport-percentage size (inset-x-[8%]/
        inset-y-[6%]) while the chart wrapper inside it was set to an
        *independent* fixed height (h-[70vh]) — on most viewports those
        two numbers don't match, leaving a large dead-space gap below the
        chart that reads as a stretched/distorted card. flex-1 + min-h-0
        makes the chart wrapper always exactly fill whatever room the
        outer card actually has, with zero gap, regardless of viewport
        size. Non-fullscreen mode is unchanged (still the fixed `height`
        prop, e.g. h-64).
      */}
      <div className={fullscreen ? "min-h-0 w-full flex-1" : `${height} w-full`}>{children}</div>
      {/* QA fix: reference terminal has a prominent explicit Close button
          in addition to the top-right icon — the icon alone wasn't
          obvious enough on first glance per the screenshot comparison. */}
      {fullscreen && (
        <div className="mt-3 flex shrink-0 justify-end">
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 rounded-md border border-border bg-accent/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        </div>
      )}
    </>
  );

  if (!fullscreen) {
    // QA fix (screenshot report: hovering a bar near a card's right edge —
    // e.g. the newest year in "Total Revenues" — shows the tooltip get cut
    // off exactly at the card's boundary, on the REGULAR grid card, not the
    // fullscreen modal). Root cause is different from the fullscreen bug
    // above: nothing here has `overflow: hidden` — the tooltip genuinely is
    // NOT clipped. The real cause is `.glass-card`'s `backdrop-filter`,
    // which (per the CSS spec, same trigger as `filter`/`transform`/
    // `opacity < 1`) forces this div into its OWN stacking context. Every
    // chart card in a grid row is a sibling, each with its own such
    // context at the default stack level ("auto") — within the same level,
    // siblings paint in DOM order, so a tooltip that visually overflows
    // this card's box into the NEXT card's box still gets painted
    // *underneath* that next card's own opaque backdrop-blurred
    // background, regardless of the tooltip's own `overflow: visible`
    // ancestors. `hover:z-10` (grid items respect z-index even at the
    // default `position: static` — no `relative` needed here since this
    // div is always a direct CSS Grid child in every caller) lifts
    // whichever card is currently being hovered above ALL of its siblings
    // in the grid's paint order, so its tooltip — the only one that can be
    // showing while hovered — renders on top instead of being covered by
    // whichever neighbor happens to sit later in the DOM.
    return <div className={`glass-card min-w-0 rounded-xl p-3 hover:z-10 sm:p-4 ${className}`}>{cardBody}</div>;
  }

  // fullscreen is only ever flipped true by a client click handler (every
  // caller initializes its `expanded` state to null/false), so `document`
  // is always available by the time this branch runs — no SSR mismatch.
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/*
        QA polish: the maximize control itself already existed (this card
        has had a fullscreen toggle since Phase 5's rebuild), but expanding
        it had no dimmed backdrop behind it and shared the same z-50 as the
        mobile sidebar drawer — on a narrow viewport with the drawer open,
        the two could contend for stacking order. A backdrop makes the
        "this chart is now front-and-center" state unambiguous and gives a
        click-outside-to-close affordance; bumping to z-[60] guarantees the
        expanded chart always wins over the sidebar (z-50) or topbar.
      */}
      <div
        className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm"
        onClick={onToggleFullscreen}
        aria-hidden="true"
      />
      {/*
        QA fix (tooltip cut off at the modal's right/bottom edge): this
        wrapper used to be `overflow-hidden`, which — per the CSS spec —
        clips ANY absolutely-positioned descendant whose box crosses this
        element's edge, including Recharts' floating tooltip (it's an
        absolutely-positioned sibling injected inside the chart's own
        wrapper div, not a sibling of this element, but `overflow-hidden`
        clips at whichever ancestor sets it, not just the immediate
        parent). The non-fullscreen card variant above was never
        `overflow-hidden` and never had this bug. `overflow-visible` here
        matches that working case; rounded-xl still clips the flat card
        background as normal; it just no longer clips a tooltip that
        legitimately needs to render slightly outside this box near the
        modal's edges.
      */}
      <div className="glass-card fixed inset-4 z-[60] flex min-w-0 flex-col overflow-visible rounded-xl p-3 shadow-2xl sm:inset-x-[8%] sm:inset-y-[6%] sm:p-4">
        {cardBody}
      </div>
    </>,
    document.body
  );
}
