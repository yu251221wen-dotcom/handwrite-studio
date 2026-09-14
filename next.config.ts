import type { NextConfig } from "next";

const isStaticExport = process.env.HANDWRITE_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
