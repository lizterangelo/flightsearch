import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module — must stay a runtime require, not a bundled asset.
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: [
      // Duffel-hosted airline logos.
      { protocol: "https", hostname: "assets.duffel.com" },
    ],
  },
};

export default nextConfig;
