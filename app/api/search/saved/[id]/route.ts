import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteSavedSearch } from "@/lib/queries/saved-searches";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteSavedSearch(session.userId, id);
  return NextResponse.json({ ok: true });
}
