import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateTeam, deleteTeam } from "@/lib/queries/admin";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  await updateTeam(Number(params.id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await deleteTeam(Number(params.id));
  return NextResponse.json({ ok: true });
}
