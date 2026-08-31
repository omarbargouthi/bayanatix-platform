// Shared, idempotent catalog upsert helpers — extracted from lib/lineage-scanner.ts
// (which was Postgres-scanner-only and kept these private/closure-coupled) so the
// v2 connectors (SSIS, Power BI/Fabric) can catalog the assets they discover
// through the exact same non-destructive upsert-by-natural-key pattern v1 uses,
// instead of duplicating it a third time.
import { sql } from "../db";
import type { LineageLayerCode } from "../queries/lineage";

// Layer classification heuristic per v1 §6.5: name-prefix conventions for
// RAW/STAGING, is_view_indicator for VIEW, else TABLE. Connectors that already
// know an asset's layer (SSIS destinations, Power BI datasets/reports, Fabric
// items) should pass layerCodeOverride to ensureEntity instead of relying on this.
export function classifyLayer(tableName: string, isView: boolean): LineageLayerCode {
  if (isView) return "VIEW";
  const n = tableName.toLowerCase();
  if (n.startsWith("raw_") || n.endsWith("_raw")) return "RAW";
  if (n.startsWith("stg_") || n.endsWith("_stg")) return "STAGING";
  return "TABLE";
}

export async function ensureDataSource(
  sourceName: string,
  sourceTypeCode: string,
  hostAddress: string | null,
  databaseName: string | null,
  opts: { placeholder?: boolean; connectionId?: number } = {},
): Promise<number> {
  const [existing] = await sql<{ id: number }[]>`
    SELECT data_source_id AS id FROM bayanat.data_sources WHERE source_name_text = ${sourceName}
  `;
  if (existing) return existing.id;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_sources (source_name_text, source_type_code, host_address_text, database_name_text, description_text, connection_id)
    VALUES (
      ${sourceName}, ${sourceTypeCode}, ${hostAddress}, ${databaseName ?? sourceName},
      ${opts.placeholder ? "Auto-created — unresolved connection reference, pending stewardship review" : null},
      ${opts.connectionId ?? null}
    )
    RETURNING data_source_id AS id
  `;
  return row.id;
}

export async function ensureSchema(dataSourceId: number, schemaName: string): Promise<number> {
  const [existing] = await sql<{ id: number }[]>`
    SELECT schema_id AS id FROM bayanat.data_schemas WHERE data_source_id = ${dataSourceId} AND schema_name_text = ${schemaName}
  `;
  if (existing) return existing.id;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_schemas (data_source_id, schema_name_text) VALUES (${dataSourceId}, ${schemaName})
    RETURNING schema_id AS id
  `;
  return row.id;
}

export async function ensureEntity(
  schemaId: number,
  tableName: string,
  isView: boolean,
  opts: { layerCodeOverride?: LineageLayerCode; displayName?: string; description?: string; placeholder?: boolean } = {},
): Promise<number> {
  const layerCode = opts.layerCodeOverride ?? classifyLayer(tableName, isView);
  const [existing] = await sql<{ id: number }[]>`
    SELECT entity_id AS id FROM bayanat.data_entities WHERE schema_id = ${schemaId} AND entity_name_text = ${tableName}
  `;
  if (existing) {
    await sql`
      UPDATE bayanat.data_entities SET layer_code = ${layerCode}
      WHERE entity_id = ${existing.id} AND layer_code IS NULL
    `;
    return existing.id;
  }
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, is_view_indicator, layer_code, description_text)
    VALUES (${schemaId}, ${tableName}, ${opts.displayName ?? tableName}, ${isView}, ${layerCode},
      ${opts.placeholder ? (opts.description ?? "Auto-created — unresolved connection reference, pending stewardship review") : (opts.description ?? null)})
    RETURNING entity_id AS id
  `;
  return row.id;
}

export async function ensureAttribute(
  entityId: number,
  columnName: string,
  dataType: string | null,
  opts: { attributeClassCode?: string; displayName?: string } = {},
): Promise<number> {
  const [existing] = await sql<{ id: number }[]>`
    SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${entityId} AND physical_name_text = ${columnName}
  `;
  if (existing) {
    if (opts.attributeClassCode) {
      await sql`UPDATE bayanat.data_attributes SET attribute_class_code = ${opts.attributeClassCode} WHERE attribute_id = ${existing.id} AND attribute_class_code IS NULL`;
    }
    return existing.id;
  }
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, attribute_class_code)
    VALUES (${entityId}, ${columnName}, ${opts.displayName ?? columnName}, ${dataType ?? "unknown"}, ${opts.attributeClassCode ?? null})
    RETURNING attribute_id AS id
  `;
  return row.id;
}
