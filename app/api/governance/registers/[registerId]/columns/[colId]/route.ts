import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateColumn, deleteColumn } from "@/lib/queries/gov-registers";

export async function PATCH(req: Request, { params }: { params: { colId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await updateColumn(Number(params.colId), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { colId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteColumn(Number(params.colId));
  return NextResponse.json({ ok: true });
}
