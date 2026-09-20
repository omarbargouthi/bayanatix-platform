import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBusinessTermSitTypes, setBusinessTermSitTypes } from "@/lib/queries/sit-classification";

// "Adding SIT to a business term" — same interaction shape as the generic Tags
// picker (GET current, PUT full replacement set) but a dedicated association
// (business_term_sit_types), not a tag with a fixed name.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const glossaryId = Number(params.id);
  if (!Number.isFinite(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  return NextResponse.json(await getBusinessTermSitTypes(glossaryId));
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const glossaryId = Number(params.id);
  if (!Number.isFinite(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { sitTypeIds }: { sitTypeIds: number[] } = await req.json().catch(() => ({ sitTypeIds: [] }));
  await setBusinessTermSitTypes(glossaryId, Array.isArray(sitTypeIds) ? sitTypeIds.map(Number) : [], session.userId);
  return NextResponse.json({ ok: true });
}
