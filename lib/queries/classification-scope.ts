import { sql } from "../db";

// Shared "assets this user owns or stewards" filter, reused by both
// classification/columns and getClassificationStatsScoped — matches on the
// data source, since asset_stakeholders can be assigned at the source,
// schema, or table level and any of the three should unlock everything under
// that source for this purpose. Every caller must alias the data_schemas
// join as `s` (matching the existing convention in both call sites).
export function myAssetsSourceFilter(userId: string) {
  return sql`
    s.data_source_id IN (
      SELECT DISTINCT asset_id FROM bayanat.asset_stakeholders
      WHERE asset_type_code = 'DATA_SOURCES' AND user_id = ${userId}
      UNION
      SELECT DISTINCT sc2.data_source_id FROM bayanat.asset_stakeholders stk2
      JOIN bayanat.data_schemas sc2 ON sc2.schema_id = stk2.asset_id
      WHERE stk2.asset_type_code = 'DATA_SCHEMAS' AND stk2.user_id = ${userId}
      UNION
      SELECT DISTINCT sc3.data_source_id FROM bayanat.asset_stakeholders stk3
      JOIN bayanat.data_entities  en3 ON en3.entity_id  = stk3.asset_id
      JOIN bayanat.data_schemas   sc3 ON sc3.schema_id  = en3.schema_id
      WHERE stk3.asset_type_code = 'DATA_ENTITIES' AND stk3.user_id = ${userId}
    )
  `;
}
