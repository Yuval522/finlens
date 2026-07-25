import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (Fontsource) — no external Google Fonts fetch
// required at build time. Family names are wired to --font-sans / --font-mono
// in globals.css and consumed via tailwind.config.ts.
import "@fontsource-variable/open-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinLens — Financial Intelligence",
  description:
    "FinLens is a next-generation financial terminal with live market data, charting, technical indicators, and screening for US & TASE equities.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0F131A",
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
        {children}
      </body>
    </html>
  );
}
