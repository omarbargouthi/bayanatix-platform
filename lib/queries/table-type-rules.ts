// Reading and saving the table type rules (db/168), and applying them to tables that
// are already in the catalog. The rules themselves are in lib/table-type-rules.ts.
import { sql } from "../db";
import { logUpdate } from "../audit";
import {
  classifyTableType, withTableTypeDefaults,
  type CategoryCode, type ConfidenceCode, type TableTypeConfig,
} from "../table-type-rules";

const SYSTEM_ACTOR = "SYSTEM";

export async function getTableTypeConfig(): Promise<TableTypeConfig> {
  const [row] = await sql<{ config: unknown }[]>`SELECT config_json AS config FROM bayanat.table_type_rule_settings WHERE settings_id = 1`;
  return withTableTypeDefaults(row?.config);
}

export async function saveTableTypeConfig(config: TableTypeConfig, userId: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.table_type_rule_settings (settings_id, config_json, updated_by_user_id, updated_at)
    VALUES (1, ${sql.json(config as never)}, ${userId}, now())
    ON CONFLICT (settings_id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
  `;
}

export type RescoreChange = {
  entityId: number; schema: string; table: string;
  fromCode: string | null; fromConfidence: string | null; toCode: CategoryCode; toConfidence: ConfidenceCode;
};

/**
 * Scores the tables already in the catalog with the given rules, the same way a crawl
 * would. Only tables a crawl has scored before and whose type no steward has confirmed
 * are touched — a confirmed type (including one read from the source) stays as it is.
 * With `apply` false nothing is written and the result is what would change.
 */
export async function rescoreTableTypes(config: TableTypeConfig, apply: boolean): Promise<{ scored: number; typeChanged: number; confidenceChanged: number; changes: RescoreChange[] }> {
  const tables = await sql<{
    id: number; schema: string; name: string; rowCount: string | number | null;
    category: string | null; suggested: string | null; confidence: string | null; columns: string[] | null;
  }[]>`
    SELECT e.entity_id AS id, s.schema_name_text AS schema, e.entity_name_text AS name, e.row_count_estimate AS "rowCount",
           e.entity_category_code AS category, e.suggested_category_code AS suggested, e.category_confidence_code AS confidence,
           (SELECT array_agg(a.physical_name_text) FROM bayanat.data_attributes a
             WHERE a.entity_id = e.entity_id AND coalesce(a.lifecycle_status_code, 'ACTIVE') <> 'DEPRECATED') AS columns
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE e.suggested_category_code IS NOT NULL
      AND coalesce(e.category_is_confirmed, false) = false
      AND coalesce(e.lifecycle_status_code, 'ACTIVE') <> 'DEPRECATED'
    ORDER BY s.schema_name_text, e.entity_name_text
  `;

  const changes: RescoreChange[] = [];
  let confidenceChanged = 0;
  for (const t of tables) {
    const next = classifyTableType(t.schema, {
      name: t.name,
      columns: (t.columns ?? []).map((name) => ({ name })),
      rowCount: t.rowCount == null ? undefined : Number(t.rowCount),
    }, config);
    const typeMoved = next.code !== t.category;
    if (!typeMoved && next.code === t.suggested && next.confidence === t.confidence) continue;
    if (typeMoved) {
      changes.push({ entityId: Number(t.id), schema: t.schema, table: t.name, fromCode: t.category, fromConfidence: t.confidence, toCode: next.code, toConfidence: next.confidence });
    } else if (next.confidence !== t.confidence) confidenceChanged++;
    if (!apply) continue;
    await sql`
      UPDATE bayanat.data_entities
      SET suggested_category_code = ${next.code}, category_confidence_code = ${next.confidence}, entity_category_code = ${next.code}
      WHERE entity_id = ${t.id} AND coalesce(category_is_confirmed, false) = false
    `;
    if (typeMoved) {
      await logUpdate("DATA_ENTITIES", Number(t.id), SYSTEM_ACTOR, [
        { field: "suggested_category_code", oldVal: t.suggested, newVal: next.code },
        { field: "entity_category_code", oldVal: t.category, newVal: next.code },
      ]).catch(() => {});
    }
  }
  return { scored: tables.length, typeChanged: changes.length, confidenceChanged, changes };
}
