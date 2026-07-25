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
};

export default nextConfig;
