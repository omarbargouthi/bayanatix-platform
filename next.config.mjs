/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // libpg-query loads a WASM binary relative to its own package location at
  // runtime; letting webpack bundle it breaks that path resolution (ENOENT).
  // Keep it external so it's require()'d normally from node_modules instead.
  experimental: {
    serverComponentsExternalPackages: ["libpg-query"],
  },
};
export default nextConfig;
