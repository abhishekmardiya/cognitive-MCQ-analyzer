import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
