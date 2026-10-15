import { NextResponse } from "next/server";
import { invalidVaultRef } from "@/lib/secrets-vault";
import { getSession } from "@/lib/auth";
import { getAuthSettings, updateAuthSettings, AuthSettingsError, type AuthSettingsPatch } from "@/lib/queries/auth-settings";
import { clearOidcConfigCache } from "@/lib/auth/oidc";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getAuthSettings());
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as AuthSettingsPatch;

  const badRef = invalidVaultRef(body.oidcClientSecret, body.ldapBindPassword);
  if (badRef) return NextResponse.json({ error: badRef }, { status: 400 });
  try {
    await updateAuthSettings(body, session.userId);
  } catch (e) {
    if (e instanceof AuthSettingsError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  clearOidcConfigCache();
  return NextResponse.json(await getAuthSettings());
}
