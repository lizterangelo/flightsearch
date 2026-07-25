import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Duffel-hosted airline logos.
      { protocol: "https", hostname: "assets.duffel.com" },
    ],
  },
};

export default nextConfig;
