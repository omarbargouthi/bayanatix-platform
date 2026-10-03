import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLineageGraph, type LineageAssetType, type LineageScopeCode } from "@/lib/queries/lineage";
import { buildExport, type LineageRow } from "@/lib/lineage/excel";

// GET — the lineage currently shown (same focus/scope/depth as the graph) as an
// Excel file in the upload template's format, so it can be edited and re-uploaded.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const assetType = sp.get("assetType") as LineageAssetType;
  const assetId = Number(sp.get("assetId"));
  const scope = (sp.get("scope") === "ATTRIBUTE_LEVEL" ? "ATTRIBUTE_LEVEL" : "ENTITY_LEVEL") as LineageScopeCode;
  const up = Math.min(10, Math.max(1, Number(sp.get("up") ?? 2)));
  const down = Math.min(10, Math.max(1, Number(sp.get("down") ?? 2)));
  if ((assetType !== "DATA_ENTITIES" && assetType !== "DATA_ATTRIBUTES") || !Number.isFinite(assetId)) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const graph = await getLineageGraph(assetType, assetId, scope, up, down);
  const nodeById = new Map(graph.nodes.map((n) => [n.entityId, n]));
  const rows: LineageRow[] = graph.edges.map((e) => {
    const s = nodeById.get(e.sourceEntityId), t = nodeById.get(e.targetEntityId);
    return {
      sourceSystem: s?.sourceName ?? "", sourceSchema: s?.schemaName ?? "", sourceTable: s?.entityName ?? "", sourceColumn: e.sourceColumnName ?? "",
      targetSystem: t?.sourceName ?? "", targetSchema: t?.schemaName ?? "", targetTable: t?.entityName ?? "", targetColumn: e.targetColumnName ?? "",
      transformationType: e.transformationTypeCode ?? "", logic: e.transformationLogicText ?? "",
    };
  });
  const buf = await buildExport(rows, graph.edges.map((e) => (e.provenanceCode === "SCANNED" ? (e.isConfirmed ? "Scanned (confirmed)" : "Scanned") : "Manual")));
  const safeName = graph.focus.name.replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lineage-${safeName}.xlsx"`,
    },
  });
}
