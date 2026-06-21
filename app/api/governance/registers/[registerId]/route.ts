import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRegister, updateRegister, softDeleteRegister } from "@/lib/queries/gov-registers";

export async function GET(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.role === "ADMIN";
  const reg = await getRegister(Number(params.registerId), isAdmin);
  if (!reg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(reg);
}

export async function PATCH(req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, description } = await req.json();
  await updateRegister(Number(params.registerId), name, description ?? null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { registerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await softDeleteRegister(Number(params.registerId), session.email);
  return NextResponse.json({ ok: true });
}
