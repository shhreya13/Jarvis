import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard is a pure client-side console: every gateway call happens in
  // the operator's browser with the paired bearer token. Nothing here needs
  // server-side data fetching, so the config stays minimal.
  reactStrictMode: true,
};

export default nextConfig;
