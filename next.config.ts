import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lalals.s3.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'musicgpt.s3.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return [
      {
        // Restrict CORS to the app's own origin instead of wildcard
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: origin },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
