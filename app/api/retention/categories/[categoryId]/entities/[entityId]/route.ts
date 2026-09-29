import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateCategoryEntity, unassignCategoryEntity } from "@/lib/queries/retention";

type Ctx = { params: { categoryId: string; entityId: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entityId = Number(params.entityId);
  if (!Number.isFinite(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { keyAttributeId, cascadeEnabled, isMaster } = await req.json() as {
    keyAttributeId: number | null; cascadeEnabled: boolean; isMaster?: boolean;
  };

  await updateCategoryEntity(entityId, keyAttributeId ?? null, !!cascadeEnabled, !!isMaster);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categoryId = Number(params.categoryId);
  const entityId = Number(params.entityId);
  if (!Number.isFinite(categoryId) || !Number.isFinite(entityId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await unassignCategoryEntity(categoryId, entityId);
  return NextResponse.json({ ok: true });
}
