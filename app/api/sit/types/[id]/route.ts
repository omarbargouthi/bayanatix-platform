import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateSitType, deleteSitType } from "@/lib/queries/sit-classification";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sitTypeId = Number(params.id);
  if (!Number.isFinite(sitTypeId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  await updateSitType(sitTypeId, {
    sitName: typeof body.sit_name === "string" ? body.sit_name.trim() : undefined,
    classificationCode: "classification_code" in body ? body.classification_code : undefined,
    description: "description" in body ? body.description : undefined,
  });
  return NextResponse.json({ ok: true });
}

// Deleting a SIT type cascades to its patterns and every business term's
// association with it (business_term_sit_types ON DELETE CASCADE) — the terms
// themselves are untouched, they simply lose that SIT designation.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sitTypeId = Number(params.id);
  if (!Number.isFinite(sitTypeId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteSitType(sitTypeId);
  return NextResponse.json({ ok: true });
}
