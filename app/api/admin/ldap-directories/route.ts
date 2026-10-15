import { NextResponse } from "next/server";
import { invalidVaultRef } from "@/lib/secrets-vault";
import { getSession } from "@/lib/auth";
import { listLdapDirectories, createLdapDirectory, LdapDirectoryError, type LdapDirectoryInput } from "@/lib/queries/ldap-directories";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listLdapDirectories());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as LdapDirectoryInput;
  const badRef = invalidVaultRef(body.ldapBindPassword);
  if (badRef) return NextResponse.json({ error: badRef }, { status: 400 });
  try {
    const directoryId = await createLdapDirectory(body, session.userId);
    return NextResponse.json({ directoryId }, { status: 201 });
  } catch (e) {
    if (e instanceof LdapDirectoryError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
