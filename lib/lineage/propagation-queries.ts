// Read side of lineage propagation: the suggestion queue and the history of what
// was applied automatically, with human-readable labels for assets and values.
import { sql } from "../db";

export type PropagationRow = {
  propagationId: number; field: string; mode: "AUTO" | "SUGGEST"; status: string;
  targetType: string; targetId: number; targetLabel: string | null; targetEntityId: number | null; targetSchemaId: number | null;
  sourceType: string; sourceId: number; sourceLabel: string | null;
  valueRef: number | null; valueLabel: string | null; valueText: string | null;
  classCode: string | null; isPii: boolean | null;
  hop: number; reason: string | null; createdAt: string; decidedAt: string | null; decidedBy: string | null;
};

// Label of a catalog asset: "table.column" for a column, "table" for a table.
const label = (alias: string, typeCol: string, idCol: string) => sql.unsafe(`
  LEFT JOIN bayanat.data_attributes ${alias}a ON ${typeCol} = 'DATA_ATTRIBUTES' AND ${alias}a.attribute_id = ${idCol}
  LEFT JOIN bayanat.data_entities ${alias}e ON ${alias}e.entity_id = CASE WHEN ${typeCol} = 'DATA_ATTRIBUTES' THEN ${alias}a.entity_id ELSE ${idCol} END
`);

export async function listPropagations(f: {
  view: "SUGGESTED" | "APPLIED" | "HISTORY"; field?: string; q?: string; page?: number;
}): Promise<{ rows: PropagationRow[]; total: number; counts: { suggested: number; applied: number } }> {
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase()}%` : null;
  const rows = await sql<(PropagationRow & { total: number })[]>`
    WITH p AS (
      SELECT p.propagation_id AS "propagationId", p.field_code AS field, p.mode_code AS mode, p.status_code AS status,
        p.target_asset_type AS "targetType", p.target_asset_id AS "targetId",
        te.entity_name_text || coalesce('.' || ta.physical_name_text, '') AS "targetLabel", te.entity_id AS "targetEntityId", te.schema_id AS "targetSchemaId",
        p.source_asset_type AS "sourceType", p.source_asset_id AS "sourceId",
        se.entity_name_text || coalesce('.' || sa.physical_name_text, '') AS "sourceLabel",
        p.value_ref_id AS "valueRef",
        CASE p.field_code WHEN 'TAG' THEN tg.tag_name WHEN 'RETENTION' THEN dc.name ELSE bg.term_name_text END AS "valueLabel",
        p.value_text AS "valueText",
        CASE WHEN p.field_code = 'CLASSIFICATION' THEN bg.classification_code END AS "classCode",
        CASE WHEN p.field_code = 'CLASSIFICATION' THEN bg.is_pii_indicator END AS "isPii",
        p.hop_count AS hop, p.reason_text AS reason, p.created_at::text AS "createdAt", p.decided_at::text AS "decidedAt",
        u.full_name AS "decidedBy"
      FROM bayanat.lineage_propagations p
      ${label("t", "p.target_asset_type", "p.target_asset_id")}
      ${label("s", "p.source_asset_type", "p.source_asset_id")}
      LEFT JOIN bayanat.business_glossaries bg ON p.field_code IN ('CLASSIFICATION', 'BUSINESS_TERM') AND bg.glossary_id = p.value_ref_id
      LEFT JOIN bayanat.tags tg ON p.field_code = 'TAG' AND tg.tag_id = p.value_ref_id
      LEFT JOIN bayanat.data_categories dc ON p.field_code = 'RETENTION' AND dc.category_id = p.value_ref_id
      LEFT JOIN bayanat.users u ON u.user_id = p.decided_by_user_id
      WHERE ${f.view === "SUGGESTED" ? sql`p.status_code = 'SUGGESTED'` : f.view === "APPLIED" ? sql`p.status_code = 'APPLIED'` : sql`p.status_code IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')`}
        ${f.field ? sql`AND p.field_code = ${f.field}` : sql``}
    )
    SELECT *, count(*) OVER ()::int AS total FROM p
    WHERE true ${q ? sql`AND lower(concat_ws(' ', "targetLabel", "sourceLabel", "valueLabel", "valueText")) LIKE ${q}` : sql``}
    ORDER BY coalesce("decidedAt", "createdAt") DESC, "propagationId" DESC
    LIMIT 50 OFFSET ${(page - 1) * 50}
  `;
  const [counts] = await sql<{ suggested: number; applied: number }[]>`
    SELECT count(*) FILTER (WHERE status_code = 'SUGGESTED')::int AS suggested, count(*) FILTER (WHERE status_code = 'APPLIED')::int AS applied
    FROM bayanat.lineage_propagations
  `;
  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0, counts };
}
