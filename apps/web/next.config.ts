import type { NextConfig } from "next";
import { resolve } from "node:path";

const monorepoRoot = resolve(import.meta.dirname, "../..");

const internalApiUrl = (process.env.INTERNAL_API_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);

const securityHeaders = [
  { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/webp"],
    localPatterns: [
      { pathname: "/api/v1/product-images/**" },
      { pathname: "/api/v1/admin/products/*/image" },
      { pathname: "/favicon.svg" },
      { pathname: "/icons/**" },
    ],
    maximumResponseBody: 5 * 1024 * 1024,
    minimumCacheTTL: 60,
    qualities: [75],
    remotePatterns: [
      { protocol: "https", hostname: "api.qrserver.com", pathname: "/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/products/:path*",
        destination: `${internalApiUrl}/api/v1/products/:path*`,
      },
      {
        source: "/api/v1/product-images/:imageKey",
        destination: `${internalApiUrl}/api/v1/product-images/:imageKey`,
      },
    ];
  },
};

export default nextConfig;
