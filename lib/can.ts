import { sql } from "./db";
import type { SessionUser } from "./types";

export async function canEditMetadata(session: SessionUser): Promise<boolean> {
  if (session.role === "ADMIN" || session.role === "STEWARD") return true;

  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.metadata_write = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (
          SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId}
        )
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}

/**
 * Row-level edit permission for a specific asset (Bulk Download/Upload spec §3.1 /
 * AC8) — canEditMetadata() above is intentionally left as a global-only check since
 * every existing call site relies on that; this is a separate, additive function
 * that also honors DATA_SOURCE/SCHEMA/TABLE-scoped role_assignments (data model and
 * admin UI already existed to create these, they just weren't enforced anywhere).
 * A column's permission resolves through its owning table.
 */
export async function canEditAsset(
  session: SessionUser,
  assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES" | "DATA_SOURCES",
  assetId: number,
): Promise<boolean> {
  if (session.role === "ADMIN" || session.role === "STEWARD") return true;

  let entityId: number | null = assetType === "DATA_ENTITIES" ? assetId : null;
  let schemaId: number | null = null;
  let dataSourceId: number | null = assetType === "DATA_SOURCES" ? assetId : null;

  if (assetType === "DATA_ATTRIBUTES") {
    const [row] = await sql<{ entityId: number }[]>`
      SELECT entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ${assetId}
    `;
    entityId = row?.entityId ?? null;
  }
  if (entityId != null) {
    const [row] = await sql<{ schemaId: number | null; dataSourceId: number | null }[]>`
      SELECT s.schema_id AS "schemaId", s.data_source_id AS "dataSourceId"
      FROM bayanat.data_entities e LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_id = ${entityId}
    `;
    schemaId = row?.schemaId ?? null;
    dataSourceId = row?.dataSourceId ?? dataSourceId;
  }

  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.metadata_write = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId})
      )
      AND (
        ra.resource_type = 'GLOBAL'
        OR (ra.resource_type = 'TABLE' AND ra.resource_id = ${entityId != null ? String(entityId) : null})
        OR (ra.resource_type = 'SCHEMA' AND ra.resource_id = ${schemaId != null ? String(schemaId) : null})
        OR (ra.resource_type = 'DATA_SOURCE' AND ra.resource_id = ${dataSourceId != null ? String(dataSourceId) : null})
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}
