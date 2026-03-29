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
};

export default nextConfig;
