import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { previewPropagation, type PreviewScenario } from "@/lib/lineage/propagation";

// GET — what metadata flows downstream from a column (or every column of a table)
// today, and what would change with a planned change. Read-only.
//   ?assetType=DATA_ATTRIBUTES|DATA_ENTITIES &assetId=
//   &scenario=NONE|REMOVE|RECLASSIFY (RECLASSIFY: columns only) &newTerm=<glossary id, empty = no classification>
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const assetType = sp.get("assetType");
  const assetId = Number(sp.get("assetId"));
  if ((assetType !== "DATA_ENTITIES" && assetType !== "DATA_ATTRIBUTES") || !Number.isFinite(assetId)) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }
  const raw = sp.get("scenario");
  let scenario: PreviewScenario = raw === "REMOVE" || raw === "RECLASSIFY" ? raw : "NONE";
  if (scenario === "RECLASSIFY" && assetType !== "DATA_ATTRIBUTES") scenario = "NONE";
  const newTerm = sp.get("newTerm") ? Number(sp.get("newTerm")) : null;

  const columns = assetType === "DATA_ATTRIBUTES"
    ? [assetId]
    : (await sql<{ id: number }[]>`SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${assetId}`).map((r) => Number(r.id));

  return NextResponse.json(await previewPropagation({ columns, scenario, newTerm: Number.isFinite(newTerm) ? newTerm : null }));
}
