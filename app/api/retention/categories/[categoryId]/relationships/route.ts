import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCategoryRelationships, addRelationship } from "@/lib/queries/retention-relationships";

type Ctx = { params: { categoryId: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categoryId = Number(params.categoryId);
  if (!Number.isFinite(categoryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await getCategoryRelationships(categoryId);
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categoryId = Number(params.categoryId);
  if (!Number.isFinite(categoryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json() as {
    parentEntityId: number; parentAttributeId: number;
    childEntityId: number; childAttributeId: number;
    joinConditionText?: string | null; discoveryMethod?: "SUGGESTED_FK" | "MANUAL"; sourceLinkId?: number | null;
  };
  const { parentEntityId, parentAttributeId, childEntityId, childAttributeId } = body;
  if (!parentEntityId || !parentAttributeId || !childEntityId || !childAttributeId) {
    return NextResponse.json({ error: "parentEntityId, parentAttributeId, childEntityId, childAttributeId are required" }, { status: 400 });
  }
  if (parentAttributeId === childAttributeId) {
    return NextResponse.json({ error: "Parent and child columns cannot be the same" }, { status: 400 });
  }

  const relationshipId = await addRelationship({
    categoryId, parentEntityId, parentAttributeId, childEntityId, childAttributeId,
    joinConditionText: body.joinConditionText?.trim() || null,
    discoveryMethod: body.discoveryMethod ?? "MANUAL",
    sourceLinkId: body.sourceLinkId ?? null,
    userId: session.userId,
  });
  return NextResponse.json({ ok: true, relationshipId }, { status: 201 });
}
