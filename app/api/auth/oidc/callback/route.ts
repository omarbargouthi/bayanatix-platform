import { NextResponse } from "next/server";
import { getResolvedAuthConfig } from "@/lib/queries/auth-settings";
import { completeOidcLogin, OidcAuthError } from "@/lib/auth/oidc";
import { findOrCreateExternalUser } from "@/lib/provisioning";
import { setSessionCookie, signSession } from "@/lib/auth";
import { OIDC_STATE_COOKIE, OIDC_VERIFIER_COOKIE } from "@/lib/auth/oidc-cookies";
import { recordLoginAttempt } from "@/lib/auth/rate-limit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const stateCookie = req.headers.get("cookie")?.match(new RegExp(`${OIDC_STATE_COOKIE}=([^;]+)`))?.[1];
  const verifierCookie = req.headers.get("cookie")?.match(new RegExp(`${OIDC_VERIFIER_COOKIE}=([^;]+)`))?.[1];

  if (!stateCookie || !verifierCookie) {
    return loginError(url.origin, "SSO sign-in session expired — please try again.");
  }

  let expected: { state: string; redirectTo: string };
  try {
    expected = JSON.parse(decodeURIComponent(stateCookie));
  } catch {
    return loginError(url.origin, "Invalid SSO sign-in state.");
  }

  try {
    const config = await getResolvedAuthConfig();
    const identity = await completeOidcLogin(config, url, {
      state: expected.state,
      codeVerifier: decodeURIComponent(verifierCookie),
    });
    const sessionUser = await findOrCreateExternalUser({
      email: identity.email, fullName: identity.fullName, subject: identity.subject, provider: "OIDC",
    });
    await recordLoginAttempt(identity.email, true);

    const token = await signSession(sessionUser);
    setSessionCookie(token);
    const res = NextResponse.redirect(new URL(expected.redirectTo || "/homepage", url.origin));
    res.cookies.delete(OIDC_STATE_COOKIE);
    res.cookies.delete(OIDC_VERIFIER_COOKIE);
    return res;
  } catch (e) {
    const message = e instanceof OidcAuthError ? e.message : "SSO sign-in failed";
    return loginError(url.origin, message);
  }
}

function loginError(origin: string, message: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
}
