import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  output: "standalone",
  // Allow images from avatar provider CDNs
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.heygen.com",
      },
      {
        protocol: "https",
        hostname: "**.d-id.com",
      },
      {
        protocol: "https",
        hostname: "**.simli.ai",
      },
      {
        protocol: "https",
        hostname: "**.elevenlabs.io",
      },
    ],
  },
  // Silence hydration warnings from browser extensions
  reactStrictMode: true,
};

export default nextConfig;
