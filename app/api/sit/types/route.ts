import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSitTypes, createSitType } from "@/lib/queries/sit-classification";

// The standalone SIT catalog (National ID, Email Address, IBAN, ...) — backs the
// admin pattern editor and the business-term association picker.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSitTypes());
}

// Creating a catalog entry is ADMIN-only — same rationale as pattern authoring:
// it's shared technical taxonomy, not a per-term editorial choice.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sitName = (body.sit_name as string ?? "").trim();
  if (!sitName) return NextResponse.json({ error: "sit_name is required" }, { status: 400 });

  try {
    const id = await createSitType({ sitName, classificationCode: body.classification_code ?? null, description: body.description ?? null });
    return NextResponse.json({ ok: true, sitTypeId: id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
