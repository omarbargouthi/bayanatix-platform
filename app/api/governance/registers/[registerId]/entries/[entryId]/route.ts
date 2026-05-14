import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateEntry, deleteEntry } from "@/lib/queries/gov-registers";

export async function PATCH(req: Request, { params }: { params: { entryId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await req.json();
  await updateEntry(Number(params.entryId), data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { entryId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteEntry(Number(params.entryId));
  return NextResponse.json({ ok: true });
}
