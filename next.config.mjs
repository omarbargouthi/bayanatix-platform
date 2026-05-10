/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Optional native DB drivers — not bundled, resolved by Node at runtime
  serverExternalPackages: ["oracledb", "mssql", "mysql2"],
};
export default nextConfig;
