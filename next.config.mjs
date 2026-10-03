// Content-Security-Policy (verified page by page in a browser). Everything must come
// from this origin except Google Fonts; no plugins, no framing, no foreign forms
// targets other than https (OIDC sign-in redirects). Next.js still needs inline
// scripts for its hydration payload, and eval + websockets in dev only (React
// Refresh / HMR). Tightening to nonce-based scripts is a follow-up that needs a
// per-request nonce through middleware.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'none'",
].join("; ");

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
  // Security headers, applied to every response (CSP defined above).
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
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};
export default nextConfig;
