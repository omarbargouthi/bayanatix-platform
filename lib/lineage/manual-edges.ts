// Shared writes for manually-curated lineage — used by the Add Lineage dialog
// (app/api/lineage/manual) and the Excel import (lib/lineage/excel.ts) so both
// create exactly the same rows.
import { sql } from "../db";
import { ensureDataSource, ensureSchema, ensureEntity } from "./catalog-upsert";
import type { LineageLayerCode } from "../queries/lineage";

export const LINEAGE_LAYERS = ["SOURCE", "RAW", "STAGING", "TABLE", "VIEW", "LAKEHOUSE", "SEMANTIC_MODEL", "REPORT"] as const;
export const EXTERNAL_SOURCE_NAME = "External systems";

// Endpoints that aren't in the catalog (an application, a file feed, a report
// tool) are recorded as entities under one "External systems" source, so the
// graph, impact analysis and propagation treat them like any other node.
export async function ensureExternalEntity(name: string, layerCode: string = "SOURCE"): Promise<number> {
  const layer = (LINEAGE_LAYERS as readonly string[]).includes(layerCode) ? layerCode : "SOURCE";
  const dsId = await ensureDataSource(EXTERNAL_SOURCE_NAME, "EXTERNAL", null, "external");
  const schemaId = await ensureSchema(dsId, "manual");
  return ensureEntity(schemaId, name, layer === "VIEW", {
    layerCodeOverride: layer as LineageLayerCode,
    description: "Added manually as a lineage endpoint",
  });
}

type Tx = typeof sql;

// Upserts one MANUAL edge (confirmed by definition — a person drew it).
// `onlyIfMissing` leaves an existing edge's type/logic untouched — used for the
// table-level link implied by a column-level row, which must not wipe notes a
// steward already wrote on that table link.
export async function upsertManualEdge(
  tx: Tx,
  edge: { scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL"; sourceId: number; targetId: number; typeCode: string; logic: string | null; userId: string; onlyIfMissing?: boolean },
): Promise<number | null> {
  const assetType = edge.scope === "ENTITY_LEVEL" ? "DATA_ENTITIES" : "DATA_ATTRIBUTES";
  if (edge.onlyIfMissing) {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO bayanat.data_lineage
        (lineage_scope_code, source_asset_id, target_asset_id, asset_type_code,
         transformation_type_code, transformation_logic_text, provenance_code, is_confirmed, updated_by_user_id)
      VALUES (${edge.scope}, ${edge.sourceId}, ${edge.targetId}, ${assetType}, ${edge.typeCode}, ${edge.logic}, 'MANUAL', true, ${edge.userId})
      ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1)) DO NOTHING
      RETURNING lineage_id AS id
    `;
    return row ? Number(row.id) : null;
  }
  const [row] = await tx<{ id: number }[]>`
    INSERT INTO bayanat.data_lineage
      (lineage_scope_code, source_asset_id, target_asset_id, asset_type_code,
       transformation_type_code, transformation_logic_text, provenance_code, is_confirmed, updated_by_user_id)
    VALUES (${edge.scope}, ${edge.sourceId}, ${edge.targetId}, ${assetType}, ${edge.typeCode}, ${edge.logic}, 'MANUAL', true, ${edge.userId})
    ON CONFLICT (lineage_scope_code, source_asset_id, target_asset_id, COALESCE(process_id, -1))
    DO UPDATE SET transformation_type_code = EXCLUDED.transformation_type_code,
                  transformation_logic_text = EXCLUDED.transformation_logic_text,
                  updated_by_user_id = EXCLUDED.updated_by_user_id,
                  last_updated_timestamp = NOW()
    RETURNING lineage_id AS id
  `;
  return Number(row.id);
}
