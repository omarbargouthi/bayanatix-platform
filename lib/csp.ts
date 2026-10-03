// Content-Security-Policy, built per request by middleware.ts (edge-safe: no Node APIs).
// Scripts run only with this request's nonce ('strict-dynamic' lets those scripts load
// the app's chunks); Next.js stamps the nonce on its own inline scripts automatically
// because the policy is also passed on the request headers. Everything else must come
// from this origin except Google Fonts; no plugins, no framing, no foreign form targets
// other than https (OIDC sign-in redirects). eval + websockets in dev only (React
// Refresh / HMR). Inline styles stay allowed (React style props, much lower risk).

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildCsp(nonce: string, isDev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
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
}
