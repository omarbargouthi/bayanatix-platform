import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addTeamMember, removeTeamMember } from "@/lib/queries/admin";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await addTeamMember(Number(params.id), userId);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();
  await removeTeamMember(Number(params.id), userId);
  return NextResponse.json({ ok: true });
}
