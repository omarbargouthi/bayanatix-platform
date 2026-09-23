// Short-lived, HttpOnly cookies carrying OIDC PKCE state across the redirect to
// the IdP and back — there's no server-side session yet to store these against.
export const OIDC_STATE_COOKIE = "bayanatix_oidc_state";
export const OIDC_VERIFIER_COOKIE = "bayanatix_oidc_verifier";

export const oidcCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 600,
};
