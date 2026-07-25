import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Type-checking and linting are run as separate, explicit steps
  // (`npx tsc --noEmit`, `npm run lint`) rather than inside `next build`'s
  // own worker — verified faster and more reliable in this workspace.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // QA fix: a recurring bug report described a small circular "N" badge
  // overlapping the sidebar's bottom-left collapse control. There is no
  // such element anywhere in Sidebar.tsx (or any FinLens component) — this
  // is Next.js's own built-in development-mode indicator, which defaults
  // to `position: "bottom-left"` (confirmed against next/dist's own config
  // type declarations), landing directly on top of our sidebar's own
  // bottom-left control purely by coincidence of position. It's dev-only
  // (never renders in a production build) and not a FinLens bug, but
  // moving it to a corner nothing else in this app occupies resolves the
  // visual collision during local development.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
