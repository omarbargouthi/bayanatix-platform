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
  // Baseline security headers, applied to every response. Deliberately no
  // Content-Security-Policy here yet — a real CSP needs to be built against this
  // app's actual inline-script/style usage (verified in a browser) or it silently
  // breaks pages; these headers are the safe, well-understood subset that doesn't
  // require that verification.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Only takes effect once served over HTTPS (browsers ignore it over plain
          // HTTP) — this is what makes the site "ready" for TLS/client-certificate
          // termination at a reverse proxy in front of it.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
