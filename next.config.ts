import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    // Keep pdf stack external so Node loads fontkit **dist** (null-safe GPOS). Bundling
    // can compile fontkit from `source` and hit "null (reading 'xCoordinate')" on Indic text.
    "pdfmake",
    "pdfkit",
    "fontkit",
    "linebreak",
  ],
  // pdf.js loads the fake worker via dynamic import(); tracing skips it unless listed.
  outputFileTracingIncludes: {
    "/api/evaluate": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          ...(process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
            ? [
                {
                  key: "X-Robots-Tag",
                  value: "index, follow",
                },
              ]
            : [
                {
                  key: "X-Robots-Tag",
                  value: "noindex, nofollow",
                },
              ]),
        ],
      },
    ];
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
