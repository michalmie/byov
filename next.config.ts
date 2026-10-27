import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: process.env.FACTORY_LOCAL_HOST ? [process.env.FACTORY_LOCAL_HOST] : [],
};

export default nextConfig;
