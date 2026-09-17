import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addHoldCondition } from "@/lib/queries/legal-holds";

function canManage(role: string) {
  return role === "ADMIN" || role === "OFFICER";
}

export async function POST(req: Request, { params }: { params: { holdId: string; entityId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const holdId = Number(params.holdId);
  const entityId = Number(params.entityId);
  if (isNaN(holdId) || isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { attributeId, valueText } = await req.json() as { attributeId: number; valueText: string };
  if (!attributeId) return NextResponse.json({ error: "attributeId is required" }, { status: 400 });
  if (!valueText?.trim()) return NextResponse.json({ error: "valueText is required" }, { status: 400 });

  const conditionId = await addHoldCondition(holdId, entityId, attributeId, valueText.trim());
  return NextResponse.json({ ok: true, conditionId }, { status: 201 });
}
