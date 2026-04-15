import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow images from the Supabase Storage public bucket, WordPress media
    // libraries, and WP gravatars. `unoptimized` is also set on individual
    // images where we want to bypass optimization for user-uploaded content.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "pitcherlist.com",
      },
      {
        protocol: "https",
        hostname: "*.pitcherlist.com",
      },
      {
        protocol: "https",
        hostname: "secure.gravatar.com",
      },
      {
        protocol: "https",
        hostname: "*.gravatar.com",
      },
    ],
  },
};

export default nextConfig;
