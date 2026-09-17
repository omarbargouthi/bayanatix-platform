import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { removeHoldCondition } from "@/lib/queries/legal-holds";

function canManage(role: string) {
  return role === "ADMIN" || role === "OFFICER";
}

export async function DELETE(_req: Request, { params }: { params: { holdId: string; conditionId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const holdId = Number(params.holdId);
  const conditionId = Number(params.conditionId);
  if (isNaN(holdId) || isNaN(conditionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await removeHoldCondition(holdId, conditionId);
  return NextResponse.json({ ok: true });
}
