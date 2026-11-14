import type { NextConfig } from "next";
import { securityHeaders, NO_STORE } from "./src/lib/http-security";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(process.env, process.env.NODE_ENV === "production") },
      { source: "/auth/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }, { key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
