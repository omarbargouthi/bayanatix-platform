// Manual lineage changes with approval + history. Every add/edit/delete of a
// MANUAL lineage link (dialog, Mapping Register, Excel import) is recorded in
// bayanat.lineage_changes. If an admin has mapped a workflow to LINEAGE_CHANGE,
// the changes wait as PENDING under one asset request until it is approved
// (applyLineageRequest, called from lib/workflow.ts) — otherwise they apply
// immediately, still recorded. Scanned links are never changed by hand: a
// reviewer raises a LINEAGE_REVIEW request against them instead.
import { sql } from "../db";
import { logUpdate } from "../audit";
import { startWorkflow, resolveAssetSteward } from "../workflow";
import { createNotification } from "../queries/notifications";
import { upsertManualEdge } from "./manual-edges";
import { schedulePropagation } from "./propagation";

export type LineageScope = "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";
export type LineageOp =
  | { op: "CREATE"; scope: LineageScope; sourceId: number; targetId: number; typeCode: string; logic: string | null; keepExisting?: boolean }
  | { op: "UPDATE"; lineageId: number; typeCode: string; logic: string | null }
  | { op: "DELETE"; lineageId: number };
export type SubmitResult = { mode: "APPLIED" | "PENDING"; requestId: number | null; changes: number };

type EdgeRow = {
  lineageId: number; scope: LineageScope; sourceId: number; targetId: number;
  typeCode: string | null; logic: string | null; provenance: string;
};

async function loadEdges(ids: number[]): Promise<Map<number, EdgeRow>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<EdgeRow[]>`
    SELECT lineage_id AS "lineageId", lineage_scope_code AS scope, source_asset_id AS "sourceId", target_asset_id AS "targetId",
           transformation_type_code AS "typeCode", transformation_logic_text AS logic, provenance_code AS provenance
    FROM bayanat.data_lineage WHERE lineage_id = ANY(${ids})
  `;
  return new Map(rows.map((r) => [Number(r.lineageId), { ...r, lineageId: Number(r.lineageId), sourceId: Number(r.sourceId), targetId: Number(r.targetId) }]));
}

// The table an edge lands on — what requests and audit entries hang off.
async function targetEntityOf(scope: LineageScope, targetId: number): Promise<number | null> {
  if (scope === "ENTITY_LEVEL") return targetId;
  const [row] = await sql<{ entityId: number }[]>`SELECT entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ${targetId}`;
  return row ? Number(row.entityId) : null;
}

export async function describeEdge(scope: LineageScope, sourceId: number, targetId: number): Promise<string> {
  const name = async (id: number) => {
    const [r] = scope === "ENTITY_LEVEL"
      ? await sql<{ n: string }[]>`SELECT entity_name_text AS n FROM bayanat.data_entities WHERE entity_id = ${id}`
      : await sql<{ n: string }[]>`SELECT e.entity_name_text || '.' || a.physical_name_text AS n FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id WHERE a.attribute_id = ${id}`;
    return r?.n ?? `#${id}`;
  };
  return `${await name(sourceId)} → ${await name(targetId)}`;
}

type ChangeRow = {
  changeId: number; op: "CREATE" | "UPDATE" | "DELETE"; lineageId: number | null; scope: LineageScope;
  sourceId: number; targetId: number; typeCode: string | null; logic: string | null; keepExisting: boolean; userId: string;
};

// Applies one recorded change to data_lineage; returns false if it no longer applies
// (e.g. the edge it edits was removed meanwhile).
async function applyChange(tx: typeof sql, c: ChangeRow): Promise<boolean> {
  if (c.op === "CREATE") {
    const id = await upsertManualEdge(tx, {
      scope: c.scope, sourceId: c.sourceId, targetId: c.targetId, typeCode: c.typeCode ?? "MANUAL",
      logic: c.logic, userId: c.userId, onlyIfMissing: c.keepExisting,
    });
    let lineageId = id;
    if (lineageId == null) {
      // Kept the existing link (keepExisting): record which one it was.
      const [existing] = await tx<{ id: number }[]>`
        SELECT lineage_id AS id FROM bayanat.data_lineage
        WHERE lineage_scope_code = ${c.scope} AND source_asset_id = ${c.sourceId} AND target_asset_id = ${c.targetId} AND process_id IS NULL
      `;
      lineageId = existing ? Number(existing.id) : null;
    }
    await tx`UPDATE bayanat.lineage_changes SET lineage_id = ${lineageId} WHERE change_id = ${c.changeId}`;
    return true;
  }
  const [before] = await tx<Record<string, unknown>[]>`
    SELECT lineage_scope_code, source_asset_id, target_asset_id, transformation_type_code, transformation_logic_text, provenance_code
    FROM bayanat.data_lineage WHERE lineage_id = ${c.lineageId} AND provenance_code = 'MANUAL'
  `;
  if (!before) return false;
  await tx`UPDATE bayanat.lineage_changes SET previous_json = ${tx.json(before as never)} WHERE change_id = ${c.changeId}`;
  if (c.op === "UPDATE") {
    await tx`
      UPDATE bayanat.data_lineage SET transformation_type_code = ${c.typeCode}, transformation_logic_text = ${c.logic},
        updated_by_user_id = ${c.userId}, last_updated_timestamp = NOW()
      WHERE lineage_id = ${c.lineageId}
    `;
  } else {
    await tx`DELETE FROM bayanat.data_lineage WHERE lineage_id = ${c.lineageId}`;
  }
  return true;
}

const CHANGE_COLS = sql`
  change_id AS "changeId", op_code AS op, lineage_id AS "lineageId", lineage_scope_code AS scope,
  source_asset_id AS "sourceId", target_asset_id AS "targetId", transformation_type_code AS "typeCode",
  transformation_logic_text AS logic, keep_existing AS "keepExisting", requested_by_user_id AS "userId"
`;

async function auditApplied(changes: ChangeRow[]) {
  const byTarget = new Map<number, { userId: string; ops: string[] }>();
  for (const c of changes) {
    const entityId = await targetEntityOf(c.scope, c.targetId);
    if (entityId == null) continue;
    const entry = byTarget.get(entityId) ?? { userId: c.userId, ops: [] };
    entry.ops.push(`${c.op.toLowerCase()} ${await describeEdge(c.scope, c.sourceId, c.targetId)}`);
    byTarget.set(entityId, entry);
  }
  for (const [entityId, e] of byTarget) {
    await logUpdate("DATA_ENTITIES", entityId, e.userId, [
      { field: "lineage_edge", oldVal: null, newVal: e.ops.slice(0, 5).join("; ") + (e.ops.length > 5 ? ` (+${e.ops.length - 5} more)` : "") },
    ]).catch(() => {});
  }
}

export async function submitLineageChanges(
  ops: LineageOp[], userId: string,
  meta: { origin: "DIALOG" | "REGISTER" | "IMPORT"; title: string; note?: string | null; priority?: "HIGH" | "MEDIUM" | "LOW" },
): Promise<SubmitResult | { error: string }> {
  if (ops.length === 0) return { error: "Nothing to change" };

  // Resolve UPDATE/DELETE ops to the edges they touch; only manual links can be changed by hand.
  const edges = await loadEdges(ops.flatMap((o) => (o.op === "CREATE" ? [] : [o.lineageId])));
  for (const o of ops) {
    if (o.op === "CREATE") continue;
    const e = edges.get(o.lineageId);
    if (!e) return { error: `Lineage link #${o.lineageId} not found` };
    if (e.provenance !== "MANUAL") return { error: "Scanned links can't be changed by hand — raise a review request instead" };
  }
  const pendingClash = await sql<{ id: number }[]>`
    SELECT lineage_id AS id FROM bayanat.lineage_changes
    WHERE status_code = 'PENDING' AND lineage_id = ANY(${ops.flatMap((o) => (o.op === "CREATE" ? [] : [o.lineageId]))})
    LIMIT 1
  `;
  if (pendingClash.length > 0) return { error: "This link already has a change waiting for approval" };

  const rows = ops.map((o) => {
    if (o.op === "CREATE") return { ...o, lineageId: null as number | null };
    const e = edges.get(o.lineageId)!;
    return {
      op: o.op, lineageId: o.lineageId, scope: e.scope, sourceId: e.sourceId, targetId: e.targetId,
      typeCode: o.op === "UPDATE" ? o.typeCode : e.typeCode, logic: o.op === "UPDATE" ? o.logic : e.logic, keepExisting: false,
    };
  });

  const [mapping] = await sql<{ workflowId: number }[]>`
    SELECT workflow_id AS "workflowId" FROM bayanat.request_type_workflows WHERE request_type_code = 'LINEAGE_CHANGE'
  `;

  let requestId: number | null = null;
  if (mapping) {
    const targetEntities = new Map<number, string>();
    for (const r of rows) {
      const id = await targetEntityOf(r.scope, r.targetId);
      if (id != null && !targetEntities.has(id)) {
        const [n] = await sql<{ n: string }[]>`SELECT entity_name_text AS n FROM bayanat.data_entities WHERE entity_id = ${id}`;
        targetEntities.set(id, n?.n ?? `#${id}`);
      }
    }
    const summary = [
      `${rows.filter((r) => r.op === "CREATE").length} to add, ${rows.filter((r) => r.op === "UPDATE").length} to edit, ${rows.filter((r) => r.op === "DELETE").length} to remove.`,
      meta.note?.trim() ? `Note: ${meta.note.trim()}` : null,
      "Review the proposed links in Data Lineage › Mapping Asset (filter: Pending approval).",
    ].filter(Boolean).join(" ");
    const [req] = await sql<{ requestId: number }[]>`
      INSERT INTO bayanat.asset_requests (request_type_code, title, description_text, priority_code, raised_by_user_id)
      VALUES ('LINEAGE_CHANGE', ${meta.title}, ${summary}, ${meta.priority ?? "MEDIUM"}, ${userId})
      RETURNING request_id AS "requestId"
    `;
    requestId = req.requestId;
    for (const [id, name] of [...targetEntities].slice(0, 50)) {
      await sql`INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name) VALUES (${requestId}, 'DATA_ENTITIES', ${id}, ${name})`;
    }
  }

  const inserted = await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const out: ChangeRow[] = [];
    for (const r of rows) {
      const [c] = await t<ChangeRow[]>`
        INSERT INTO bayanat.lineage_changes
          (request_id, op_code, lineage_id, lineage_scope_code, source_asset_id, target_asset_id,
           transformation_type_code, transformation_logic_text, keep_existing, status_code, origin_code, change_note, requested_by_user_id)
        VALUES (${requestId}, ${r.op}, ${r.lineageId}, ${r.scope}, ${r.sourceId}, ${r.targetId},
           ${r.typeCode}, ${r.logic}, ${r.keepExisting ?? false}, ${mapping ? "PENDING" : "APPLIED"}, ${meta.origin}, ${meta.note ?? null}, ${userId})
        RETURNING ${CHANGE_COLS}
      `;
      out.push({ ...c, sourceId: Number(c.sourceId), targetId: Number(c.targetId) });
      if (!mapping) await applyChange(t, c);
    }
    if (!mapping) await t`UPDATE bayanat.lineage_changes SET decided_at = now() WHERE change_id = ANY(${out.map((c) => c.changeId)})`;
    return out;
  });

  if (!mapping) {
    await auditApplied(inserted);
    schedulePropagation("lineage-change");
    return { mode: "APPLIED", requestId: null, changes: inserted.length };
  }
  // A "Deactive" workflow approves on the spot — applyLineageRequest runs inside startWorkflow.
  await startWorkflow(requestId!, "LINEAGE_CHANGE", meta.title).catch((e) => console.error("[lineage change workflow]", e));
  const [still] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM bayanat.lineage_changes WHERE request_id = ${requestId} AND status_code = 'PENDING'`;
  return { mode: still.n > 0 ? "PENDING" : "APPLIED", requestId, changes: inserted.length };
}

// Called by the workflow engine when a LINEAGE_CHANGE request is approved or rejected.
export async function applyLineageRequest(requestId: number, approved: boolean): Promise<void> {
  const pending = await sql<ChangeRow[]>`
    SELECT ${CHANGE_COLS} FROM bayanat.lineage_changes WHERE request_id = ${requestId} AND status_code = 'PENDING' ORDER BY change_id
  `;
  if (pending.length === 0) return;
  if (!approved) {
    await sql`UPDATE bayanat.lineage_changes SET status_code = 'REJECTED', decided_at = now() WHERE request_id = ${requestId} AND status_code = 'PENDING'`;
    return;
  }
  const applied: ChangeRow[] = [];
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    for (const raw of pending) {
      const c = { ...raw, sourceId: Number(raw.sourceId), targetId: Number(raw.targetId) };
      const ok = await applyChange(t, c);
      await t`UPDATE bayanat.lineage_changes SET status_code = ${ok ? "APPLIED" : "REJECTED"}, decided_at = now() WHERE change_id = ${c.changeId}`;
      if (ok) applied.push(c);
    }
  });
  await auditApplied(applied);
  if (applied.length > 0) schedulePropagation("lineage-change-approved");
}

// "This link doesn't look right" — a review request against one lineage link,
// routed by workflow (or straight to the target table's owner + stewards).
export async function raiseLineageReview(
  lineageId: number, userId: string, reason: string, priority: "HIGH" | "MEDIUM" | "LOW",
): Promise<{ requestId: number; notified: number } | { error: string }> {
  const edge = (await loadEdges([lineageId])).get(lineageId);
  if (!edge) return { error: "Lineage link not found" };
  if (!reason.trim()) return { error: "Say what looks wrong with this link" };
  const label = await describeEdge(edge.scope, edge.sourceId, edge.targetId);
  const entityId = await targetEntityOf(edge.scope, edge.targetId);
  const title = `Review lineage link: ${label}`;
  const description = `${edge.provenance === "SCANNED" ? "Scanned" : "Manual"} link (${edge.typeCode ?? "no transformation type"}). Reason: ${reason.trim()}`;

  const [req] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests (request_type_code, title, description_text, priority_code, raised_by_user_id)
    VALUES ('LINEAGE_REVIEW', ${title}, ${description}, ${priority}, ${userId})
    RETURNING request_id AS "requestId"
  `;
  await sql`INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name) VALUES (${req.requestId}, 'DATA_LINEAGE', ${lineageId}, ${label})`;
  if (entityId != null) {
    const [n] = await sql<{ n: string }[]>`SELECT entity_name_text AS n FROM bayanat.data_entities WHERE entity_id = ${entityId}`;
    await sql`INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name) VALUES (${req.requestId}, 'DATA_ENTITIES', ${entityId}, ${n?.n ?? null})`;
  }

  const [mapping] = await sql`SELECT 1 FROM bayanat.request_type_workflows WHERE request_type_code = 'LINEAGE_REVIEW'`;
  let notified = 0;
  if (mapping) {
    await startWorkflow(req.requestId, "LINEAGE_REVIEW", title).catch(() => {});
  } else if (entityId != null) {
    for (const person of await resolveAssetSteward("DATA_ENTITIES", entityId).catch(() => [] as string[])) {
      if (person === userId) continue;
      await createNotification({
        userId: person, type: "WORKFLOW", title: `Lineage link to review: ${label}`, body: reason.trim(),
        severity: priority === "HIGH" ? "WARNING" : "INFO", actionLabel: "View Request", actionHref: `/requests/${req.requestId}`,
      }).catch(() => {});
      notified++;
    }
  }
  return { requestId: req.requestId, notified };
}
