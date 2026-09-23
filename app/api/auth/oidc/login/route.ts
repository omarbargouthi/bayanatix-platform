import { NextResponse } from "next/server";
import { getResolvedAuthConfig } from "@/lib/queries/auth-settings";
import { startOidcLogin } from "@/lib/auth/oidc";
import { OIDC_STATE_COOKIE, OIDC_VERIFIER_COOKIE, oidcCookieOptions } from "@/lib/auth/oidc-cookies";

export async function GET(req: Request) {
  const config = await getResolvedAuthConfig();
  if (config.providerType !== "OIDC") {
    return NextResponse.json({ error: "OIDC is not the configured authentication provider" }, { status: 400 });
  }

  try {
    const { redirectUrl, state, codeVerifier } = await startOidcLogin(config);
    const redirectTo = new URL(req.url).searchParams.get("redirectTo") || "/homepage";

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set(OIDC_STATE_COOKIE, JSON.stringify({ state, redirectTo }), oidcCookieOptions);
    res.cookies.set(OIDC_VERIFIER_COOKIE, codeVerifier, oidcCookieOptions);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to start SSO sign-in" }, { status: 500 });
  }
}
