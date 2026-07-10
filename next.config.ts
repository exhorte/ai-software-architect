import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Compute runs the standalone server output, not `next start`.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;
