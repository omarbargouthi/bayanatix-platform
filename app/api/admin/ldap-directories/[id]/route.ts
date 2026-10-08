import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateLdapDirectory, deleteLdapDirectory, LdapDirectoryError, type LdapDirectoryInput } from "@/lib/queries/ldap-directories";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as LdapDirectoryInput;
  try {
    await updateLdapDirectory(Number(params.id), body, session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LdapDirectoryError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await deleteLdapDirectory(Number(params.id), session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LdapDirectoryError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
