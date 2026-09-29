import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateRelationship, deleteRelationship } from "@/lib/queries/retention-relationships";

type Ctx = { params: { categoryId: string; relationshipId: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const relationshipId = Number(params.relationshipId);
  if (!Number.isFinite(relationshipId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json() as { joinConditionText?: string | null; isActive?: boolean };
  const joinConditionText = "joinConditionText" in body ? (body.joinConditionText?.trim() || null) : undefined;
  await updateRelationship(relationshipId, joinConditionText, body.isActive);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const relationshipId = Number(params.relationshipId);
  if (!Number.isFinite(relationshipId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteRelationship(relationshipId);
  return NextResponse.json({ ok: true });
}
