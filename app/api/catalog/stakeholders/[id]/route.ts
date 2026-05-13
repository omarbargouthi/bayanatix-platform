import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { removeStakeholder } from "@/lib/queries/stakeholders";

type Params = { params: { id: string } };

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assignmentId = Number(params.id);
  if (!Number.isFinite(assignmentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await removeStakeholder(assignmentId);
  return NextResponse.json({ ok: true });
}
