import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Next 16 logs Server Function arguments in development by default.
    serverFunctions: false,
    incomingRequests: { ignore: [/^\/auth\/callback(?:\?|$)/] },
  },
  async headers() {
    return ["/auth/:path*", "/forgot-password", "/reset-password"].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "private, no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }));
  },
  allowedDevOrigins: ["192.168.100.27"],
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
