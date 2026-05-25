const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const middlewareClientMaxBodySize = process.env.NEXT_MIDDLEWARE_CLIENT_MAX_BODY_SIZE ?? "2gb";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir,
  experimental: {
    middlewareClientMaxBodySize
  },
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${apiBaseUrl}/api/:path*`
        },
        {
          source: "/media/:path*",
          destination: `${apiBaseUrl}/media/:path*`
        },
        {
          source: "/thumbnails/:path*",
          destination: `${apiBaseUrl}/thumbnails/:path*`
        }
      ]
    };
  }
};

export default nextConfig;
