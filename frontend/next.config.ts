import type { NextConfig } from "next";

const backendUrl = (process.env.SUDIBRAN_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  async rewrites() {
    return {
      // Keep the browser same-origin while FastAPI owns the complete API contract.
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
