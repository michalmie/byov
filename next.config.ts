import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: process.env.FACTORY_LOCAL_HOST ? [process.env.FACTORY_LOCAL_HOST] : [],
  async redirects() {
    return [
      { source: "/projects", destination: "/apps", permanent: false },
      { source: "/projects/:slug", destination: "/apps/:slug", permanent: false },
    ];
  },
};

export default nextConfig;
