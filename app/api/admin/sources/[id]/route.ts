import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConnection, updateConnection, deleteConnection } from "@/lib/queries/sources";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conn = await getConnection(Number(params.id));
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...conn, passwordText: conn.passwordText ? "••••••••" : null });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  await updateConnection(Number(params.id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteConnection(Number(params.id));
  return NextResponse.json({ ok: true });
}
