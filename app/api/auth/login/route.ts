import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/queries/users";
import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { getResolvedAuthConfig } from "@/lib/queries/auth-settings";
import { authenticateLdap, LdapAuthError } from "@/lib/auth/ldap";
import { findOrCreateExternalUser } from "@/lib/provisioning";
import { isLoginRateLimited, recordLoginAttempt } from "@/lib/auth/rate-limit";

// The login screen lets the user pick which configured method to use — `provider`
// says which one they picked (OIDC is redirect-only and never posts here, see
// /api/auth/oidc/login instead). Defaults to LOCAL for older clients/scripts that
// don't send it.
const Body = z.object({
  provider: z.enum(["LOCAL", "LDAP"]).default("LOCAL"),
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
    if (parsed.provider === "LDAP") {
      if (!config.ldapEnabled) {
        return NextResponse.json({ error: "LDAP sign-in is not enabled." }, { status: 400 });
      }
      return await handleLdapLogin(parsed.email, parsed.password, config);
    }

    if (!config.localEnabled) {
      return NextResponse.json({ error: "Local sign-in is not enabled." }, { status: 400 });
    }
    const user = await findUserByEmail(parsed.email);
    if (!user || user.auth_provider_code !== "LOCAL" || !user.password_hash) {
      await recordLoginAttempt(parsed.email, false);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    return await handleLocalLogin(user, parsed.password);
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
