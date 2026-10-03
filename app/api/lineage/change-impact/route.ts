import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getDownstreamImpact, type LineageAssetType } from "@/lib/queries/lineage";
import { startWorkflow, resolveAssetSteward } from "@/lib/workflow";
import { createNotification } from "@/lib/queries/notifications";

const CHANGE_TYPES: Record<string, string> = {
  RENAME: "Rename", DATA_TYPE: "Data type change", REMOVE: "Removal",
  LOGIC: "Calculation / logic change", VALUES: "Allowed values / format change", OTHER: "Other change",
};

type Body = {
  assetType: LineageAssetType;
  assetId: number;
  changeType: string;
  description?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  targets: { assetType: LineageAssetType; assetId: number }[];
};

// POST — "Assess a planned change": raises one CHANGE_IMPACT_REVIEW request per
// impacted downstream table (its impacted columns listed in the description),
// routed to that table's owner + stewards. Targets are re-checked against the
// live downstream impact so only genuinely impacted assets can be flagged.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const body: Body = await req.json();
  if (body.assetType !== "DATA_ENTITIES" && body.assetType !== "DATA_ATTRIBUTES") return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  if (!Number.isFinite(body.assetId)) return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  if (!CHANGE_TYPES[body.changeType]) return NextResponse.json({ error: "Invalid change type" }, { status: 400 });
  const priority = body.priority && ["HIGH", "MEDIUM", "LOW"].includes(body.priority) ? body.priority : "MEDIUM";
  if (!Array.isArray(body.targets) || body.targets.length === 0) return NextResponse.json({ error: "Select at least one impacted asset" }, { status: 400 });

  // The asset being changed, for titles.
  const [focus] = body.assetType === "DATA_ATTRIBUTES"
    ? await sql<{ name: string }[]>`
        SELECT e.entity_name_text || '.' || a.physical_name_text AS name
        FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.attribute_id = ${body.assetId}`
    : await sql<{ name: string }[]>`SELECT entity_name_text AS name FROM bayanat.data_entities WHERE entity_id = ${body.assetId}`;
  if (!focus) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const impact = await getDownstreamImpact(body.assetType, body.assetId, 10);
  const impacted = new Map(impact.levels.flatMap((l) => l.assets).map((a) => [`${a.assetType}:${a.assetId}`, a]));
  const chosen = body.targets.map((t) => impacted.get(`${t.assetType}:${t.assetId}`)).filter((a): a is NonNullable<typeof a> => !!a);
  if (chosen.length === 0) return NextResponse.json({ error: "None of the selected assets are downstream of this asset" }, { status: 400 });

  // Group impacted columns under their table: one request per table.
  const colIds = chosen.filter((a) => a.assetType === "DATA_ATTRIBUTES").map((a) => a.assetId);
  const colEntity = colIds.length === 0 ? [] : await sql<{ attributeId: number; entityId: number }[]>`
    SELECT attribute_id AS "attributeId", entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ANY(${colIds})
  `;
  const entityOf = new Map(colEntity.map((r) => [Number(r.attributeId), Number(r.entityId)]));
  type Group = { entityId: number; entityName: string; minHop: number; columns: { id: number; name: string }[] };
  const groups = new Map<number, Group>();
  for (const a of chosen) {
    const entityId = a.assetType === "DATA_ENTITIES" ? a.assetId : entityOf.get(a.assetId);
    if (entityId == null) continue;
    const g = groups.get(entityId) ?? { entityId, entityName: a.assetType === "DATA_ENTITIES" ? a.name : (a.parentEntityName ?? a.name), minHop: a.depth, columns: [] };
    g.minHop = Math.min(g.minHop, a.depth);
    if (a.assetType === "DATA_ATTRIBUTES") g.columns.push({ id: a.assetId, name: a.name });
    groups.set(entityId, g);
  }

  const [mapping] = await sql<{ workflowId: number }[]>`
    SELECT workflow_id AS "workflowId" FROM bayanat.request_type_workflows WHERE request_type_code = 'CHANGE_IMPACT_REVIEW'
  `;
  const changeLabel = CHANGE_TYPES[body.changeType];
  const created: { requestId: number; entityName: string; notified: number }[] = [];

  for (const g of groups.values()) {
    const title = `Review impact of planned change: ${focus.name} → ${g.entityName}`;
    const description = [
      `Planned change to ${focus.name}: ${changeLabel}.`,
      body.description?.trim() ? `Details: ${body.description.trim()}` : null,
      `${g.entityName} is ${g.minHop} hop(s) downstream.`,
      g.columns.length ? `Impacted columns: ${g.columns.map((c) => c.name).join(", ")}.` : null,
      "Please review and fix anything on this asset that depends on the change.",
    ].filter(Boolean).join(" ");

    const [reqRow] = await sql<{ requestId: number }[]>`
      INSERT INTO bayanat.asset_requests (request_type_code, title, description_text, priority_code, raised_by_user_id)
      VALUES ('CHANGE_IMPACT_REVIEW', ${title}, ${description}, ${priority}, ${session.userId})
      RETURNING request_id AS "requestId"
    `;
    await sql`
      INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
      VALUES (${reqRow.requestId}, 'DATA_ENTITIES', ${g.entityId}, ${g.entityName})
    `;
    for (const c of g.columns) {
      await sql`
        INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
        VALUES (${reqRow.requestId}, 'DATA_ATTRIBUTES', ${c.id}, ${`${g.entityName}.${c.name}`})
      `;
    }

    let notified = 0;
    if (mapping) {
      await startWorkflow(reqRow.requestId, "CHANGE_IMPACT_REVIEW", title).catch(() => {});
    } else {
      // No workflow mapped: still put it in front of the people who own the asset.
      const people = await resolveAssetSteward("DATA_ENTITIES", g.entityId).catch(() => [] as string[]);
      for (const userId of people) {
        if (userId === session.userId) continue;
        await createNotification({
          userId, type: "WORKFLOW", title: `Change impact review: ${g.entityName}`,
          body: `${focus.name} — ${changeLabel}. Please review ${g.entityName}.`,
          severity: priority === "HIGH" ? "WARNING" : "INFO", actionLabel: "View Request", actionHref: `/requests/${reqRow.requestId}`,
        }).catch(() => {});
        notified++;
      }
    }
    created.push({ requestId: reqRow.requestId, entityName: g.entityName, notified });
  }

  return NextResponse.json({ created, workflowMapped: !!mapping }, { status: 201 });
}
