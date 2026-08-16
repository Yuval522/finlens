import type { Metadata, Viewport } from "next";
// QA fix: the app previously loaded Inter (next/font/google) for UI text
// alongside JetBrains Mono for numeric/ticker data. Per explicit direction
// the whole app should read as one sharp retro monospace face — no
// rounded/modern sans-serif remaining anywhere, headings and sidebar nav
// included. Inter is no longer imported; app/globals.css now aliases
// --font-sans directly to --font-mono, so every `font-sans` class in the
// codebase (Tailwind's default body/heading font) resolves to JetBrains
// Mono without needing to touch each component individually.
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppAuthGate } from "@/components/auth/AppAuthGate";
import { getSiteUrl } from "@/lib/seo/site-url";

const SITE_URL = getSiteUrl();
const TITLE = "Stox - Financial Intelligence";
const DESCRIPTION =
  "Stox is a next-generation financial terminal: describe a screening strategy in plain English or Hebrew and get live results, plus charting, technical indicators, and unique TASE (Tel Aviv Stock Exchange) coverage alongside US equities.";

export const metadata: Metadata = {
  // Lets every relative URL in this metadata block (and any page's own
  // metadata/generateMetadata that doesn't set an absolute one) resolve
  // against the real site domain — see lib/seo/site-url.ts.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // SEO audit finding (seo-audit-finlens-2026-08-14.md): no Open Graph /
  // Twitter Card tags at all — links shared in Slack/X/WhatsApp showed no
  // preview. Reuses the existing app icon as the preview image; a
  // dedicated 1200x630 social-card image would look better but this is a
  // real image today rather than a blank preview.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Stox",
    images: [{ url: "/icons/icon-512-any.png?v=7", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icons/icon-512-any.png?v=7"],
  },
  // ROOT CAUSE, confirmed directly (live report: icons kept looking stale/
  // boxed-in across every device and browser no matter how many times the
  // underlying PNG/ICO files were regenerated and pixel-verified correct):
  // fetching /manifest.json plain returned OLD content, while appending
  // any throwaway query string (e.g. /manifest.json?debug=1) returned the
  // correct, up-to-date one INSTANTLY — proving the deployed code was
  // always correct and the problem was a cached response sitting in front
  // of that one exact, never-versioned URL. Since `<link rel="manifest">`
  // (generated from this `manifest` field) had no cache-busting of its
  // own, EVERY client requesting it — regardless of how fresh the icons
  // block below or the underlying files were — kept being handed that
  // stale manifest, which itself still pointed at old/pre-fix icon paths.
  // No amount of fixing the icon files themselves could ever have broken
  // that chain; only versioning this href does. Bumped ?v=7 -> ?v=8 for the
  // Stox rebrand (manifest.json's name/short_name text changed, not just
  // its icon srcs — same stale-response risk applies to any content change
  // in this file) — bump ?v=8 -> ?v=9 the next time anything in
  // manifest.json changes again.
  manifest: "/manifest.json?v=8",
  // QA fix (live report: Chrome desktop/mobile tab and the PWA home-screen
  // shortcut kept falling back to a generic grey box with the letter "F",
  // or showed a stale/boxed-in icon, even after the underlying PNG/ICO
  // files were pixel-verified correct). This project is Next.js App
  // Router, so there's no index.html to hand-edit — this `icons` block is
  // what actually generates the page's <link rel="icon">/<link
  // rel="apple-touch-icon"> tags.
  //
  // This app used to ALSO have app/icon.png + app/apple-icon.png, Next's
  // file-convention favicon/apple-touch-icon special files. Those
  // auto-generate their own <link> tags at a FIXED url ("/icon.png",
  // "/apple-icon.png") that Next prepends ahead of whatever's declared
  // here — meaning a browser could still pick that first, permanently-
  // cached-at-that-exact-url tag over this deliberately versioned one, even
  // after this block's own href was updated. Removed both (renamed out of
  // the special app/icon.png / app/apple-icon.png filenames — this repo's
  // FUSE-mounted working copy doesn't allow deleting a file outright, but
  // does allow renaming one out of the way, which is enough to stop Next
  // from treating them as the icon-convention files) so this `icons` block
  // is now the ONLY source of truth for every icon tag on the page.
  //
  // ROOT CAUSE #2 (live report: browser tab still showed the old blue/green
  // waveform icon after the robot-head PNG/ICO files were regenerated and
  // pixel-verified correct on disk AND after the ?v=3->?v=4 bump above).
  // Every OTHER href in this block already carried a version query string
  // — except these two `/favicon.ico` references, which never did, on the
  // (wrong) assumption when this block was first written that favicon.ico
  // was "a brand-new path, never served under this exact name before, so
  // no stale cache can exist for it." That was false: public/favicon.ico
  // has existed at this exact URL since before this redesign even started,
  // so browsers absolutely had a cached copy of the OLD artwork sitting at
  // it — and favicon.ico is the single most stubbornly-cached asset type
  // in every major browser, often ignored by normal cache-control/refresh
  // behavior entirely. Same fix as the manifest.json case above: an
  // explicit, bump-able query string is now on both of these too. Every
  // href below carries one; bump ?v=7 -> ?v=8 the next time the artwork
  // changes to force every client to refetch without needing a filename
  // change. (?v=3 -> ?v=4: pixel-robot-head favicon regeneration, see
  // scripts/gen-favicon.py, which rasterizes the same 10x10 grid as
  // components/branding/RobotHeadMark.tsx so the tab icon and in-app logo
  // never drift apart. ?v=4 -> ?v=5: added versioning to favicon.ico
  // itself. ?v=5 -> ?v=6: fixed a real bug in gen-favicon.py's ICO writer
  // — it was generating from the smallest (16x16) frame with
  // sizes=[...] + append_images=[...], but Pillow's ICO writer doesn't
  // use append_images to embed extra frames; `sizes` downscales THE
  // SOURCE image to each listed size. Saving from 16x16 meant every
  // "size" was that same 16x16 image relabeled, and it collapsed back to
  // one embedded (16,16) frame on read — confirmed via
  // Image.open(...).info["sizes"]. Now generates from the largest (48x48)
  // frame so all three sizes are genuinely distinct.
  //
  // ROOT CAUSE #3 (live report, repeated across several rounds: robot-head
  // icon still showed a WHITE background/box behind it on phone home
  // screens, despite every "-any" PNG and favicon.ico independently
  // pixel-verifying alpha=0/transparent at their corners each time). The
  // files were never actually the bug — many Android launchers (and some
  // browsers) don't reliably honor PNG transparency, or the declared
  // "maskable" manifest icon, for a PWA home-screen shortcut, and silently
  // composite the "any"-purpose icon onto a default WHITE backdrop
  // instead. ?v=6 -> ?v=7: switched favicon.ico + both "-any" icons (see
  // scripts/gen-favicon.py's save_opaque_fullbleed) from transparent to
  // opaque, filled with the app's own dark background color (#0F131A,
  // matches manifest.json's background_color) — eliminating any
  // transparency for an OS/launcher to fill with white in the first
  // place, regardless of whether it respects the maskable icon or PNG
  // alpha correctly. The already-opaque maskable/apple-touch-icon files
  // were untouched — they never had this problem.)
  icons: {
    icon: [
      { url: "/favicon.ico?v=7", sizes: "any" },
      { url: "/icons/icon-192-any.png?v=7", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512-any.png?v=7", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico?v=7"],
    apple: [{ url: "/apple-touch-icon.png?v=7", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // QA update (new logo branding pass): matches manifest.json's theme_color
  // — the dark charcoal from the new finlens-mark artwork — so the browser
  // chrome (mobile address bar tint, installed-PWA title bar) and the
  // manifest-driven "add to home screen" appearance stay in sync instead
  // of showing two slightly different near-black shades.
  themeColor: "#1A1A1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-background text-foreground">
        {/*
          SEO audit finding (seo-audit-finlens-2026-08-14.md): AppAuthGate
          (see components/auth/AppAuthGate.tsx) is a client component that
          deliberately holds back rendering `children` until the initial
          session check resolves — necessary so a page never flashes a
          previous user's locally-cached data, but it means the server-
          rendered HTML every crawler receives, for every route, was
          nothing but a loading spinner. This block is a sibling of
          AppAuthGate, not a child of it, so it's unconditionally present
          in that same server-rendered HTML regardless of auth/hydration
          state — real, truthful copy describing the actual product
          (Stox has no separate marketing site to link to instead).
          Visually hidden (sr-only) rather than shown, since a real visitor
          already gets this same information from the app UI itself once
          it hydrates; a screen reader still announces it, which is the
          intended behavior for sr-only content, not a side effect.
        */}
        <div className="sr-only">
          <h1>Stox — Natural Language Stock Screener for US &amp; TASE Markets</h1>
          <p>
            Stox is a financial terminal for individual investors. Describe a screening
            strategy in plain English or Hebrew — for example &quot;large cap tech stocks with
            RSI under 30&quot; or &quot;dividend yield over 3% and P/E under 20&quot; — and get live
            results instead of manually configuring filters. Stox combines that natural
            language Strategy Builder with interactive charting, technical indicators (RSI,
            moving averages, MACD, Bollinger Bands), a stock screener, watchlists, and
            portfolio tracking, with coverage spanning both US equities and the Tel Aviv Stock
            Exchange (TASE) — a combination not offered by other stock screening tools.
          </p>
        </div>
        <AppAuthGate>{children}</AppAuthGate>
      </body>
    </html>
  );
}
