import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/queries/users";
import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { getResolvedAuthConfig } from "@/lib/queries/auth-settings";
import { authenticateLdap, LdapAuthError } from "@/lib/auth/ldap";
import { findOrCreateExternalUser } from "@/lib/provisioning";
import { isLoginRateLimited, recordLoginAttempt } from "@/lib/auth/rate-limit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (await isLoginRateLimited(parsed.email)) {
    return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
  }

  const config = await getResolvedAuthConfig();

  try {
    // A LOCAL account (the pre-existing demo users, and any admin-created account)
    // always signs in with its own password, regardless of the configured external
    // provider — this is the escape hatch that keeps an admin from ever being
    // locked out by a bad LDAP/OIDC config. Only emails with no LOCAL account fall
    // through to the configured external provider.
    const existing = await findUserByEmail(parsed.email);
    if (existing && existing.auth_provider_code === "LOCAL" && existing.password_hash) {
      return await handleLocalLogin(existing, parsed.password);
    }
    if (config.providerType === "LDAP") {
      return await handleLdapLogin(parsed.email, parsed.password, config);
    }
    if (config.providerType === "OIDC") {
      return NextResponse.json({ error: "This deployment signs in via SSO — use the Sign in with SSO button." }, { status: 400 });
    }
    await recordLoginAttempt(parsed.email, false);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  } catch (e) {
    await recordLoginAttempt(parsed.email, false);
    const message = e instanceof LdapAuthError ? "Invalid email or password" : (e as Error).message || "Sign-in failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

async function handleLocalLogin(user: NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>, password: string): Promise<NextResponse> {
  const ok = user.password_hash ? await verifyPassword(password, user.password_hash) : false;
  if (!ok || !user.is_active) {
    await recordLoginAttempt(user.email, false);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await recordLoginAttempt(user.email, true);
  return issueSession({
    userId: user.user_id, email: user.email, fullName: user.full_name, role: user.role,
    preferredLanguageCode: user.preferred_language_code, avatarColorCode: user.avatar_color_code,
  });
}

async function handleLdapLogin(
  username: string,
  password: string,
  config: Awaited<ReturnType<typeof getResolvedAuthConfig>>,
): Promise<NextResponse> {
  const identity = await authenticateLdap(config, username, password);
  const sessionUser = await findOrCreateExternalUser({
    email: identity.email, fullName: identity.fullName, subject: identity.dn, provider: "LDAP",
  });
  await recordLoginAttempt(username, true);
  return issueSession(sessionUser);
}

async function issueSession(user: {
  userId: string; email: string; fullName: string; role: "ADMIN" | "STEWARD" | "OFFICER" | "VIEWER";
  preferredLanguageCode: string | null; avatarColorCode: string | null;
}): Promise<NextResponse> {
  const token = await signSession(user);
  setSessionCookie(token);
  return NextResponse.json({ user });
}
