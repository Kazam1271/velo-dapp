import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
        os: false,
        net: false,
        tls: false,
      };
    } else {
      config.externals.push('crypto');
    }
    return config;
  },
};

export default nextConfig;
