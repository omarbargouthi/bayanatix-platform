import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getResolvedAuthConfig } from "@/lib/queries/auth-settings";
import { testLdapServiceBind } from "@/lib/auth/ldap";
import { getLdapDirectoryConfig } from "@/lib/queries/ldap-directories";
import { testOidcDiscovery } from "@/lib/auth/oidc";

// Validates the currently-saved config for one provider against the real
// directory/IdP — lets an admin catch a bad bind DN or issuer URL before any end
// user tries to sign in. Takes an explicit `provider` now that LDAP and OIDC can
// both be configured (and enabled) at the same time.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { provider, directoryId } = (await req.json().catch(() => ({}))) as { provider?: string; directoryId?: number };

  if (provider === "LDAP") {
    const directory = directoryId != null ? await getLdapDirectoryConfig(Number(directoryId)) : null;
    if (!directory) return NextResponse.json({ error: "Unknown directory" }, { status: 400 });
    return NextResponse.json(await testLdapServiceBind(directory));
  }
  const config = await getResolvedAuthConfig();
  if (provider === "OIDC") return NextResponse.json(await testOidcDiscovery(config));
  return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
}
