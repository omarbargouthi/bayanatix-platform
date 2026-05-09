import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateTag, deleteTag } from "@/lib/queries/catalog";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tagId = Number(params.id);
  const body = await req.json();
  await updateTag(tagId, { tagName: body.tagName, colorHex: body.colorHex, description: body.description ?? "" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteTag(Number(params.id));
  return NextResponse.json({ ok: true });
}
