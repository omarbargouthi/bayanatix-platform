import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDsrs, createDsr, dsrCategoryOptions, type DsrType } from "@/lib/privacy/dsr";

// Data subject requests. View: admin, data protection officer, steward (owners act on
// their tables). Create: admin / officer.
const canView = (role: string) => role === "ADMIN" || role === "OFFICER" || role === "STEWARD";

// GET — the requests; ?options=1 → categories with a master table and their identifier columns.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (new URL(req.url).searchParams.get("options")) return NextResponse.json(await dsrCategoryOptions());
  return NextResponse.json(await listDsrs());
}

// POST { requestType, categoryId, identifierAttributeId, externalReference?, channel?, receivedDate?, correctionDetails?, notes? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "OFFICER") return NextResponse.json({ error: "Forbidden — admin or data protection officer only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const res = await createDsr({
    requestType: String(b.requestType) as DsrType, categoryId: Number(b.categoryId), identifierAttributeId: Number(b.identifierAttributeId),
    externalReference: b.externalReference ?? null, channel: b.channel ?? null, receivedDate: b.receivedDate ?? null,
    correctionDetails: b.correctionDetails ?? null, notes: b.notes ?? null,
  }, session.userId);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res, { status: 201 });
}
