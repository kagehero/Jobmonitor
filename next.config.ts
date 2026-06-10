import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Fewer / more stable chunks for lucide (helps avoid missing vendor-chunks/*.js in dev after HMR / .env reload)
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
