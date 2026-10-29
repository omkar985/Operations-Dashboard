import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Rendering model
 * ---------------
 * `cacheComponents` / `partialPrefetching` (enabled by the scaffold) are intentionally OFF:
 * every route in this product is behind a cookie session and renders live data, and the
 * nonce-based Content-Security-Policy set in `src/proxy.ts` requires dynamic rendering.
 * Server data caching is done explicitly: durable snapshots in Supabase + a validated
 * in-memory accelerator (see src/server/services/dataset-service.ts).
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Never leak source maps of server code; keep browser maps off in production.
  productionBrowserSourceMaps: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
