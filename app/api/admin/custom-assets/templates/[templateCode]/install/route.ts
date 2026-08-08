import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { installTemplate } from "@/lib/custom-assets/templates";
import { logCreate } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { templateCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await installTemplate(params.templateCode.toUpperCase(), session.userId);
    await logCreate("CUSTOM_ASSET_TEMPLATE", 0, session.userId, [
      { field: "template_code", newVal: params.templateCode.toUpperCase() },
      { field: "created_types", newVal: result.createdTypes.join(", ") || null },
      { field: "created_relationship_types", newVal: result.createdRelationshipTypes.join(", ") || null },
    ]);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to install template" }, { status: 400 });
  }
}
