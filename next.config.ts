import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next blocks cross-origin dev requests by default, which breaks loading the
  // dev server from a phone on the LAN.
  allowedDevOrigins: ["*.local", "192.168.4.*"],
};

export default nextConfig;
