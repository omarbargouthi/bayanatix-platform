import { NextResponse } from "next/server";
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
  try {
    const directoryId = await createLdapDirectory(body, session.userId);
    return NextResponse.json({ directoryId }, { status: 201 });
  } catch (e) {
    if (e instanceof LdapDirectoryError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
