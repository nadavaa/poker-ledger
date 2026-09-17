import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next blocks cross-origin dev requests by default, which breaks loading the
  // dev server from a phone on the LAN.
  allowedDevOrigins: ["*.local", "192.168.4.*"],

  // Security headers. No CSP yet: the inline theme script and the Venmo
  // deep links need a nonce strategy that is its own piece of work, and a
  // wrong CSP on a money app is worse than none. The rest is uncontroversial.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Nothing on this site should ever render inside someone else's
          // page. "Confirm received" behind an invisible iframe is the whole
          // clickjacking threat model.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
