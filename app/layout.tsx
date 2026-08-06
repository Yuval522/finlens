import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (Fontsource) — no external Google Fonts fetch
// required at build time. Family names are wired to --font-sans / --font-mono
// in globals.css and consumed via tailwind.config.ts.
import "@fontsource-variable/open-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppAuthGate } from "@/components/auth/AppAuthGate";

export const metadata: Metadata = {
  title: "FinLens — Financial Intelligence",
  description:
    "FinLens is a next-generation financial terminal with live market data, charting, technical indicators, and screening for US & TASE equities.",
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
  // that chain; only versioning this href does. Bump ?v=3 -> ?v=4 (in
  // lockstep with the `icons` block below and manifest.json's own icon
  // srcs) the next time anything icon-related changes.
  manifest: "/manifest.json?v=3",
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
  // Every href below is either a brand-new path (public/favicon.ico,
  // public/apple-touch-icon.png — never served under these exact names
  // before, so no stale cache can exist for them) or carries an explicit
  // version query string; bump ?v=3 -> ?v=4 the next time the artwork
  // changes to force every client to refetch without needing a filename
  // change.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192-any.png?v=3", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512-any.png?v=3", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
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
        <AppAuthGate>{children}</AppAuthGate>
      </body>
    </html>
  );
}
