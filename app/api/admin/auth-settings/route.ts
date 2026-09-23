import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAuthSettings, updateAuthSettings, type AuthSettingsPatch } from "@/lib/queries/auth-settings";
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
  if (body.providerType && !["LOCAL", "LDAP", "OIDC"].includes(body.providerType)) {
    return NextResponse.json({ error: "Invalid provider type" }, { status: 400 });
  }

  await updateAuthSettings(body, session.userId);
  clearOidcConfigCache();
  return NextResponse.json(await getAuthSettings());
}
