# Stox "Retro-Digital" Design System

**Scope:** the visual language adopted across an ongoing, page-by-page redesign (Home, Strategy Builder, Screener done as of 2026-08-16; other pages — Watchlist, Portfolio, Macro, Settings, per-ticker Analysis — not yet audited against a reference). Each page so far was matched to a user-supplied reference screenshot through several rounds of iteration, so treat the patterns below as the established convention to apply *by default* to any new/untouched page, rather than re-deriving a look from scratch or waiting for a new screenshot.

**Status:** living reference — update this file when a redesign pass changes or extends a pattern, so the next session doesn't have to re-discover it via another round of screenshot comparison.

---

## 1. Color tokens

All defined as CSS custom properties in `app/globals.css`'s `:root`, consumed via `tailwind.config.ts`'s `theme.extend.colors` (`hsl(var(--x))` pattern). Change a *value* here and every `bg-primary`/`text-success`/etc. usage updates automatically.

| Token | Value | Use |
|---|---|---|
| `--background` | `220 8% 4%` (≈ `#08090A`) | Page background — deep obsidian, not pure black |
| `--card` | `220 8% 7%` | Card/panel surface |
| `--primary` | `14 100% 57%` (≈ `#FF5722`) | The one brand accent — orange-coral. Used for active nav state, buttons, glows, icon badges, focus borders |
| `--success` | `148 65% 51%` (≈ `#33D17B`) | Gains / LED green |
| `--destructive` | `350 100% 66%` (≈ `#FF5470`) | Losses / LED red |
| `--border` | `230 6% 12%` (≈ `#1c1d20`) | Sharp 1px hairline border — used everywhere, not a soft/faded divider |
| `--muted-foreground` | `220 4% 58%` | Secondary/label text |
| `--radius` | `0.625rem` (10px) | Base card corner radius |
| `--led-up` / `--led-down` | `#33d17b` / `#ff5470` | Raw hex (not `hsl(var())`) — feeds `box-shadow` glow color directly, since box-shadow needs a plain color value |

Do **not** introduce ad-hoc Tailwind colors (`slate-500`, `amber-500`, `indigo-500`, etc.) for anything that should read as "on brand" — every accent/status color in this app routes through one of the tokens above. Past passes had to sweep these out repeatedly (icon badges, warning banners, table borders) because a new component was built with an arbitrary Tailwind shade instead of the token.

## 2. Typography

- Single-font system: **JetBrains Mono** (self-hosted `@fontsource-variable/jetbrains-mono`) for everything — headings, body copy, sidebar nav, inputs, and numeric/ticker data alike. `app/globals.css`'s `:root` aliases `--font-sans: var(--font-mono);`, so Tailwind's default `font-sans` class (used by most UI text via `<body className="font-sans">` in `app/layout.tsx`) resolves to the same mono face as an explicit `font-mono` class. Inter (previously loaded via `next/font/google`) was removed entirely — no rounded/modern sans-serif remains anywhere in the app.
- `.font-mono { font-variant-numeric: tabular-nums; }` still applies for aligned numeric columns. Any price, percentage, ticker symbol, or table number should still use an explicit `font-mono` class for that tabular-nums behavior, even though visually it now matches `font-sans`.

## 3. Core primitives

- **`components/shared/Led.tsx`** — the only way to indicate up/down direction. A small pulsing dot (`.led-dot` + `.led-dot-up`/`.led-dot-down`, `led-pulse` keyframe: opacity 1 → 0.35 → 1), never an arrow glyph (`ArrowUp`/`ArrowDown` from lucide are deliberately not used for price direction anywhere in this app).
- **`components/branding/RobotHeadMark.tsx`** / **`StoxLogo.tsx`** — the brand mark is a hand-authored pixel bitmap (a grid of flat `<rect>`/`<div>` cells, `shape-rendering: crispEdges`, zero border-radius, zero gradients on the sprite itself), not a smooth SVG icon or raster image. The wordmark next to it is plain bold monospace `STOX`, uppercase, single flat color (`text-foreground`) — not a gradient split treatment. Keep this pixel-art constraint for any future branding/mascot work.

## 4. Page hero pattern

Every top-level page (`app/(dashboard)/*/page.tsx`) uses a centered, icon-less hero:

```tsx
<div className="flex flex-col items-center gap-2 text-center">
  <h1 className="text-xl font-bold text-foreground">Page Title</h1>
  <p className="text-xs text-muted-foreground">One-line subtitle.</p>
</div>
```

Earlier passes had an icon badge (`<span className="... bg-primary/15 text-primary"><Icon /></span>`) above the H1 — this was explicitly removed per reference screenshots for both Strategy Builder and Screener. Don't add an icon badge back to a page hero without a reference confirming it.

## 5. Pill / chip pattern

Used for filter presets, "what we understood" filter chips, sort/quick-action tags — anywhere a small clickable/informational tag appears:

```tsx
className={cn(
  "rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors",
  active
    ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_-2px] shadow-primary/70"
    : "border-border/80 bg-white/[0.02] text-muted-foreground hover:border-primary/60 hover:text-foreground"
)}
```

Always `rounded-full` (stadium shape) — unlike the input shell below, pills were confirmed against reference to already be correctly full-rounded, not moderate-radius.

## 6. Primary input-shell pattern

The Strategy Builder's `$ ... Run ↵` command bar is the reference for any prominent single-line input + primary action:

- Outer shell: `rounded-2xl` (moderate radius, ~16px — **not** `rounded-full`; this was a confirmed correction after initially over-rounding it), `border border-primary/60`, glowing `shadow-[0_0_28px_-6px] shadow-primary/50`, generous `px-5 py-3.5` padding.
- Primary button inside it: `rounded-xl` (slightly tighter than the shell), solid `bg-primary`, and **`text-black`** (a local override — not white/`text-primary-foreground`, which is used elsewhere for white-on-primary elements like the Topbar avatar badge and stays that way).

## 7. Table pattern

- Header row: `uppercase tracking-wide text-muted-foreground`, `border-b border-border`.
- Body rows: `border-b border-border/70`, hover `bg-accent/60`.
- Cell padding: `px-2 py-2` (compact — an earlier `py-2.5` was tightened after reference comparison).
- A supplementary/explanatory column (e.g. Strategy Builder's "Why it's close") gets a `border-l border-dotted border-border/70` divider rather than just extra spacing, on both the header cell and every row's cell.
- Don't add columns "for completeness" — the Strategy Builder table deliberately dropped Market Cap because the reference didn't include it. Match the reference's exact column set, not the superset of available data.

## 8. Cards / panels

`.glass-card` (`app/globals.css`): `background-color: hsl(var(--card))`, `border: 1px solid hsl(var(--border))`, hover glow via `hsl(var(--primary) / 0.35)`. Applied with `rounded-xl` almost everywhere. This is the default container for any bordered content block (filter sidebars, result panels, warning banners, empty states).

## 9. Persistent chrome (Sidebar + Topbar)

- **Sidebar** active nav item: `bg-primary/10 text-primary shadow-[0_0_16px_-4px] shadow-primary/50` — a glowing terminal-style highlight, not a flat background swap.
- **Topbar** (`components/layout/Topbar.tsx`, rendered on every dashboard page via `DashboardShell`): global symbol search (`SymbolSearchInput`) + a live `"N tickers · updated HH:MM UTC"` status readout (client-computed in UTC to avoid hydration mismatch) + account avatar menu, in that order, right-aligned. This row was briefly removed mid-redesign on a mistaken read of a cropped Strategy Builder screenshot, then reinstated once an uncropped Screener reference showed it was correct all along — if a future screenshot seems to argue for removing global chrome, double-check whether the screenshot is actually cropped before treating that as a real instruction.

---

## Open items

- Watchlist, Portfolio, Macro, Settings, and the per-ticker Analysis page have **not** been matched against a reference screenshot yet — they may still carry the pre-redesign look (old icon badges, non-hairline borders, non-LED direction glyphs in some spots). Check before assuming they're finished.
- `SCREENER_UNIVERSE` (used for the Topbar's ticker count) is illustrative static demo data, not a live feed — see that file's own doc comment.
