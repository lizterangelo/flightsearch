import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@browserbasehq/stagehand",
    "patchright-core",
    "playwright-core",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.gstatic.com" },
      { protocol: "https", hostname: "pics.avs.io" },
    ],
  },
};

export default nextConfig;
