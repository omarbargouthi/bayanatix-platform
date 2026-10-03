// Mapping Register: every lineage link (scanned + manual), plus proposed new
// links still waiting for approval, as one searchable/filterable list.
import { sql } from "../db";

export type RegisterFilters = {
  q?: string; origin?: "SCANNED" | "MANUAL" | ""; status?: "ACTIVE" | "PENDING" | "REVIEW" | "";
  level?: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL" | ""; page?: number; pageSize?: number;
};

export type RegisterRow = {
  lineageId: number | null; changeId: number | null; scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";
  sourceSystem: string | null; sourceSchema: string | null; sourceTable: string | null; sourceColumn: string | null;
  sourceEntityId: number | null;
  targetSystem: string | null; targetSchema: string | null; targetTable: string | null; targetColumn: string | null;
  targetEntityId: number | null;
  transformationTypeCode: string | null; transformationTypeName: string | null; logic: string | null;
  provenance: "SCANNED" | "MANUAL"; isConfirmed: boolean; processName: string | null;
  pendingOp: "CREATE" | "UPDATE" | "DELETE" | null; pendingRequestId: number | null;
  openReviews: number; updatedAt: string | null; updatedBy: string | null;
};

// Endpoint columns for one side of a link: an attribute-level link points at
// columns, so its table comes via the attribute; a table-level link at the table.
const side = (alias: string, idExpr: string, scopeExpr: string) => sql.unsafe(`
  LEFT JOIN bayanat.data_attributes ${alias}a ON ${scopeExpr} = 'ATTRIBUTE_LEVEL' AND ${alias}a.attribute_id = ${idExpr}
  LEFT JOIN bayanat.data_entities ${alias}e ON ${alias}e.entity_id = CASE WHEN ${scopeExpr} = 'ATTRIBUTE_LEVEL' THEN ${alias}a.entity_id ELSE ${idExpr} END
  LEFT JOIN bayanat.data_schemas ${alias}s ON ${alias}s.schema_id = ${alias}e.schema_id
  LEFT JOIN bayanat.data_sources ${alias}d ON ${alias}d.data_source_id = ${alias}s.data_source_id
`);

export async function getRegister(f: RegisterFilters): Promise<{ rows: RegisterRow[]; total: number }> {
  const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 50));
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase()}%` : null;

  const rows = await sql<(RegisterRow & { total: number })[]>`
    WITH links AS (
      SELECT
        dl.lineage_id AS "lineageId", NULL::int AS "changeId", dl.lineage_scope_code AS scope,
        sd.source_name_text AS "sourceSystem", ss.schema_name_text AS "sourceSchema", se.entity_name_text AS "sourceTable", sa.physical_name_text AS "sourceColumn", se.entity_id AS "sourceEntityId",
        td.source_name_text AS "targetSystem", ts.schema_name_text AS "targetSchema", te.entity_name_text AS "targetTable", ta.physical_name_text AS "targetColumn", te.entity_id AS "targetEntityId",
        dl.transformation_type_code AS "transformationTypeCode", tt.transformation_type_name_text AS "transformationTypeName",
        dl.transformation_logic_text AS logic, dl.provenance_code AS provenance, coalesce(dl.is_confirmed, false) AS "isConfirmed",
        lp.process_name AS "processName",
        pc.op_code AS "pendingOp", pc.request_id AS "pendingRequestId",
        (SELECT count(*)::int FROM bayanat.asset_request_targets art JOIN bayanat.asset_requests ar ON ar.request_id = art.request_id
          WHERE art.asset_type_code = 'DATA_LINEAGE' AND art.asset_id = dl.lineage_id AND ar.status_code IN ('OPEN', 'IN_PROGRESS')) AS "openReviews",
        -- last_updated_timestamp has no time zone (stored in the server's zone): attach it so the browser converts correctly
        (dl.last_updated_timestamp AT TIME ZONE current_setting('TimeZone'))::text AS "updatedAt", u.full_name AS "updatedBy"
      FROM bayanat.data_lineage dl
      ${side("s", "dl.source_asset_id", "dl.lineage_scope_code")}
      ${side("t", "dl.target_asset_id", "dl.lineage_scope_code")}
      LEFT JOIN bayanat.lineage_transformation_types tt ON tt.transformation_type_code = dl.transformation_type_code
      LEFT JOIN bayanat.lineage_processes lp ON lp.process_id = dl.process_id
      LEFT JOIN bayanat.users u ON u.user_id = dl.updated_by_user_id
      LEFT JOIN LATERAL (
        SELECT op_code, request_id FROM bayanat.lineage_changes c
        WHERE c.lineage_id = dl.lineage_id AND c.status_code = 'PENDING' ORDER BY change_id DESC LIMIT 1
      ) pc ON true
      UNION ALL
      SELECT
        NULL::int, lc.change_id, lc.lineage_scope_code,
        sd.source_name_text, ss.schema_name_text, se.entity_name_text, sa.physical_name_text, se.entity_id,
        td.source_name_text, ts.schema_name_text, te.entity_name_text, ta.physical_name_text, te.entity_id,
        lc.transformation_type_code, tt.transformation_type_name_text, lc.transformation_logic_text, 'MANUAL', false,
        NULL, 'CREATE', lc.request_id, 0, lc.requested_at::text, u.full_name
      FROM bayanat.lineage_changes lc
      ${side("s", "lc.source_asset_id", "lc.lineage_scope_code")}
      ${side("t", "lc.target_asset_id", "lc.lineage_scope_code")}
      LEFT JOIN bayanat.lineage_transformation_types tt ON tt.transformation_type_code = lc.transformation_type_code
      LEFT JOIN bayanat.users u ON u.user_id = lc.requested_by_user_id
      WHERE lc.status_code = 'PENDING' AND lc.op_code = 'CREATE'
    )
    SELECT *, count(*) OVER ()::int AS total FROM links
    WHERE true
      ${q ? sql`AND lower(concat_ws(' ', "sourceSystem", "sourceSchema", "sourceTable", "sourceColumn", "targetSystem", "targetSchema", "targetTable", "targetColumn", "transformationTypeName", logic, "processName")) LIKE ${q}` : sql``}
      ${f.origin ? sql`AND provenance = ${f.origin}` : sql``}
      ${f.level ? sql`AND scope = ${f.level}` : sql``}
      ${f.status === "ACTIVE" ? sql`AND "lineageId" IS NOT NULL AND "pendingOp" IS NULL` : sql``}
      ${f.status === "PENDING" ? sql`AND "pendingOp" IS NOT NULL` : sql``}
      ${f.status === "REVIEW" ? sql`AND "openReviews" > 0` : sql``}
    ORDER BY "targetTable" NULLS LAST, "targetColumn" NULLS FIRST, "sourceTable", "sourceColumn"
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 };
}

export type HistoryEntry = {
  changeId: number; op: string; status: string; origin: string; requestId: number | null;
  requestedBy: string | null; requestedAt: string; decidedAt: string | null; note: string | null;
  typeCode: string | null; logic: string | null; previous: Record<string, unknown> | null;
};

export async function getLinkHistory(lineageId: number): Promise<HistoryEntry[]> {
  return sql<HistoryEntry[]>`
    SELECT lc.change_id AS "changeId", lc.op_code AS op, lc.status_code AS status, lc.origin_code AS origin, lc.request_id AS "requestId",
           u.full_name AS "requestedBy", lc.requested_at::text AS "requestedAt", lc.decided_at::text AS "decidedAt", lc.change_note AS note,
           lc.transformation_type_code AS "typeCode", lc.transformation_logic_text AS logic, lc.previous_json AS previous
    FROM bayanat.lineage_changes lc
    LEFT JOIN bayanat.users u ON u.user_id = lc.requested_by_user_id
    WHERE lc.lineage_id = ${lineageId}
    ORDER BY lc.requested_at DESC, lc.change_id DESC
  `;
}
