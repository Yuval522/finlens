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
  manifest: "/manifest.json",
  // QA fix (live report: Chrome desktop/mobile tab and the PWA home-screen
  // shortcut kept falling back to a generic grey box with the letter "F").
  // This project is Next.js App Router, so there's no index.html to hand-edit
  // — app/icon.png and app/apple-icon.png (the file-convention favicon/
  // apple-touch-icon, already correct and full-bleed as of the previous
  // icon pass) already auto-generate <link rel="icon">/<link
  // rel="apple-touch-icon"> tags, and Next merges those in ahead of
  // whatever's declared here rather than replacing it. Declared explicitly
  // anyway, for two things the file convention alone doesn't give us:
  // 1) a true multi-resolution .ico (public/favicon.ico, 16/32/48px) for
  //    browsers that still hard-request /favicon.ico directly, since the
  //    file-convention route only ever produces a PNG; and 2) an explicit,
  //    versioned query string on every href. Next's file-convention icon
  //    routes are served at a fixed URL that never changes across deploys,
  //    so a browser/OS that already cached the OLD icon there has no signal
  //    to refetch it — these paths are either brand-new (never served
  //    before, so no stale cache can exist) or explicitly version-stamped,
  //    so a bump here (?v=2 -> ?v=3, ...) forces a fresh fetch on the next
  //    deploy without needing a filename change.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192-any.png?v=2", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512-any.png?v=2", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
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
