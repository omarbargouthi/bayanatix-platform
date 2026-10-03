import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateManualProcess, deleteManualProcess } from "@/lib/lineage/manual-processes";

type Ctx = { params: { id: string } };

async function manager() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "ADMIN" && session.role !== "STEWARD") return { error: NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 }) };
  return { session };
}

// PATCH { name?, description? } — rename / describe a named process.
export async function PATCH(req: Request, { params }: Ctx) {
  const m = await manager();
  if (m.error) return m.error;
  const b = await req.json().catch(() => ({}));
  const res = await updateManualProcess(Number(params.id), {
    name: b.name === undefined ? undefined : String(b.name),
    description: b.description === undefined ? undefined : b.description == null ? null : String(b.description),
  });
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}

// DELETE — remove a process that no longer has links.
export async function DELETE(_req: Request, { params }: Ctx) {
  const m = await manager();
  if (m.error) return m.error;
  const res = await deleteManualProcess(Number(params.id));
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
