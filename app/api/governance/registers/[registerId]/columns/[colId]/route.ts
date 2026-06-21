import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateColumn, deleteColumnWithCleanup, listColumns } from "@/lib/queries/gov-registers";

export async function PATCH(req: Request, { params }: { params: { colId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await updateColumn(Number(params.colId), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { registerId: string; colId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const colId = Number(params.colId);
  const registerId = Number(params.registerId);

  let archiveData = false;
  try {
    const body = await req.json();
    archiveData = !!body.archiveData;
  } catch {}

  // Resolve column name + key before deletion
  const cols = await listColumns(registerId);
  const col = cols.find((c) => c.columnId === colId);
  if (!col) return NextResponse.json({ error: "Column not found" }, { status: 404 });

  await deleteColumnWithCleanup(
    colId, registerId, col.columnKey, col.columnName, archiveData, session.email,
  );
  return NextResponse.json({ ok: true });
}
