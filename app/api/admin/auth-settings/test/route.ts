import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getResolvedAuthConfig } from "@/lib/queries/auth-settings";
import { testLdapServiceBind } from "@/lib/auth/ldap";
import { testOidcDiscovery } from "@/lib/auth/oidc";

// Validates the currently-saved config against the real directory/IdP — lets an
// admin catch a bad bind DN or issuer URL before any end user tries to sign in.
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await getResolvedAuthConfig();
  if (config.providerType === "LDAP") {
    return NextResponse.json(await testLdapServiceBind(config));
  }
  if (config.providerType === "OIDC") {
    return NextResponse.json(await testOidcDiscovery(config));
  }
  return NextResponse.json({ ok: true, message: "LOCAL authentication requires no connection test." });
}
