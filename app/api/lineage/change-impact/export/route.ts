import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerT } from "@/lib/i18n/server";
import { buildImpactWorkbook } from "@/lib/lineage/impact-export";

// POST — "Assess a change" as an Excel file (summary, impacted assets, propagation
// effects) in the user's language. Body: { assetType, assetId, changeType, priority,
// details, selected: ["DATA_ENTITIES:12", …] | null, planned: termId | "none" | null }.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const assetType = b.assetType === "DATA_ATTRIBUTES" ? "DATA_ATTRIBUTES" : b.assetType === "DATA_ENTITIES" ? "DATA_ENTITIES" : null;
  const assetId = Number(b.assetId);
  if (!assetType || !Number.isFinite(assetId)) return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });

  try {
    const { buffer, fileName } = await buildImpactWorkbook({
      assetType, assetId,
      changeType: String(b.changeType ?? "OTHER"), priority: String(b.priority ?? "MEDIUM"), details: String(b.details ?? "").slice(0, 4000),
      selected: Array.isArray(b.selected) ? b.selected.map(String) : null,
      planned: b.planned == null || b.planned === "" ? null : String(b.planned),
    }, await getServerT(session), session.fullName);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
