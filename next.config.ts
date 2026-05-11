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
  // Allow audio from MusicGPT S3 and external sources
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default nextConfig;
