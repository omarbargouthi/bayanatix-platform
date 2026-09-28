import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCategoryEntities, assignCategoryEntity } from "@/lib/queries/retention";

type Ctx = { params: { categoryId: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categoryId = Number(params.categoryId);
  if (!Number.isFinite(categoryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await getCategoryEntities(categoryId);
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

  const { entityId, keyAttributeId, cascadeEnabled } = await req.json() as {
    entityId: number; keyAttributeId: number | null; cascadeEnabled: boolean;
  };
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });

  await assignCategoryEntity(categoryId, entityId, keyAttributeId ?? null, !!cascadeEnabled);
  return NextResponse.json({ ok: true }, { status: 201 });
}
