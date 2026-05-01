import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  eslint: {
    // ESLint is checked separately in CI; skip during build to avoid
    // version conflicts with the monorepo's eslint config.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
