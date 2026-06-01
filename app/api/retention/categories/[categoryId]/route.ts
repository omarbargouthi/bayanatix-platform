import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { categoryId: string } };

export async function PUT(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.categoryId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const { name, nameAr, sensitivity, description, descriptionAr, examples, sortOrder, isActive } = body;

  await sql`
    UPDATE bayanat.data_categories SET
      name            = COALESCE(${name ?? null}, name),
      name_ar         = ${nameAr ?? null},
      sensitivity     = COALESCE(${sensitivity ?? null}, sensitivity),
      description     = ${description ?? null},
      description_ar  = ${descriptionAr ?? null},
      examples        = ${examples ?? null},
      sort_order      = COALESCE(${sortOrder ?? null}, sort_order),
      is_active       = COALESCE(${isActive ?? null}, is_active)
    WHERE category_id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.categoryId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Soft-delete
  await sql`UPDATE bayanat.data_categories SET is_active = false WHERE category_id = ${id}`;

  return NextResponse.json({ ok: true });
}
