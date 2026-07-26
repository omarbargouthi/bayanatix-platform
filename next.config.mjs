/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // libpg-query loads a WASM binary relative to its own package location at
  // runtime; letting webpack bundle it breaks that path resolution (ENOENT).
  // xlsx (used by the CSV/Excel data source crawler) does its own low-level
  // fs access when reading files off disk, which similarly breaks under
  // webpack bundling ("Cannot access file" even though the path is valid).
  // Keep both external so they're require()'d normally from node_modules.
  experimental: {
    serverComponentsExternalPackages: ["libpg-query", "xlsx"],
  },
};
export default nextConfig;
