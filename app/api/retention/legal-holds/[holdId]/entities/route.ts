import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHoldEntities, addHoldEntity } from "@/lib/queries/legal-holds";

function canManage(role: string) {
  return role === "ADMIN" || role === "OFFICER";
}

export async function GET(_req: Request, { params }: { params: { holdId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const holdId = Number(params.holdId);
  if (isNaN(holdId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  return NextResponse.json(await getHoldEntities(holdId));
}

export async function POST(req: Request, { params }: { params: { holdId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const holdId = Number(params.holdId);
  if (isNaN(holdId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { entityId, keyAttributeId } = await req.json() as { entityId: number; keyAttributeId: number | null };
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });

  await addHoldEntity(holdId, entityId, keyAttributeId ?? null);
  return NextResponse.json({ ok: true }, { status: 201 });
}
