// Authorization Code + PKCE against any standards-compliant OIDC issuer — this is
// the correct native path for Microsoft Entra ID (which does not speak LDAP; see
// lib/auth/ldap.ts for the on-prem Active Directory path instead).

import * as client from "openid-client";
import type { ResolvedAuthConfig } from "../queries/auth-settings";

export type OidcAuthResult = { email: string; fullName: string; subject: string };

export class OidcAuthError extends Error {}

let cachedConfig: client.Configuration | null = null;
let cachedForIssuer: string | null = null;

async function getConfig(config: ResolvedAuthConfig): Promise<client.Configuration> {
  if (!config.oidcIssuerUrl || !config.oidcClientId) {
    throw new OidcAuthError("OIDC is not fully configured");
  }
  // Cache the discovered Configuration per issuer — re-discovering on every request
  // would add a network round trip to the IdP on every login start/callback.
  if (cachedConfig && cachedForIssuer === config.oidcIssuerUrl) return cachedConfig;

  const discovered = await client.discovery(
    new URL(config.oidcIssuerUrl),
    config.oidcClientId,
    config.oidcClientSecret ?? undefined,
  );
  cachedConfig = discovered;
  cachedForIssuer = config.oidcIssuerUrl;
  return discovered;
}

/** Invalidate the cached discovery Configuration after an admin edits OIDC settings. */
export function clearOidcConfigCache(): void {
  cachedConfig = null;
  cachedForIssuer = null;
}

export type OidcLoginStart = {
  redirectUrl: URL;
  state: string;
  codeVerifier: string;
};

export async function startOidcLogin(config: ResolvedAuthConfig): Promise<OidcLoginStart> {
  const cfg = await getConfig(config);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const redirectUrl = client.buildAuthorizationUrl(cfg, {
    redirect_uri: config.oidcRedirectUri ?? "",
    scope: config.oidcScopes ?? "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  return { redirectUrl, state, codeVerifier };
}

export async function completeOidcLogin(
  config: ResolvedAuthConfig,
  currentUrl: URL,
  expected: { state: string; codeVerifier: string },
): Promise<OidcAuthResult> {
  const cfg = await getConfig(config);
  const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
    expectedState: expected.state,
    pkceCodeVerifier: expected.codeVerifier,
  });

  const claims = tokens.claims();
  if (!claims?.sub) throw new OidcAuthError("ID token missing subject claim");

  let email = typeof claims.email === "string" ? claims.email : null;
  let fullName = typeof claims.name === "string" ? claims.name : null;

  // Some tenants (Entra ID included, depending on scope/claims config) don't put
  // email/name on the ID token itself — fall back to the userinfo endpoint.
  if ((!email || !fullName) && tokens.access_token) {
    try {
      const userinfo = await client.fetchUserInfo(cfg, tokens.access_token, claims.sub);
      email = email ?? (typeof userinfo.email === "string" ? userinfo.email : null);
      fullName = fullName ?? (typeof userinfo.name === "string" ? userinfo.name : null);
    } catch {
      // Non-fatal — proceed with whatever the ID token already gave us.
    }
  }

  if (!email) throw new OidcAuthError("Identity provider did not return an email claim");
  return { email, fullName: fullName ?? email, subject: claims.sub };
}

export async function testOidcDiscovery(config: ResolvedAuthConfig): Promise<{ ok: boolean; message: string }> {
  try {
    cachedConfig = null; // force a fresh discovery call for the test
    const cfg = await getConfig(config);
    const meta = cfg.serverMetadata();
    return { ok: true, message: `Discovered issuer: ${meta.issuer}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message || "Discovery failed" };
  }
}
