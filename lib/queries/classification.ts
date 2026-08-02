import { sql } from "../db";
import { logUpdate } from "../audit";

export type SuggestionRow = {
  attributeId: number;
  physicalName: string;
  friendlyName: string | null;
  entityId: number;
  entityName: string;
  schemaName: string;
  suggestedClass: string | null;
  confidence: number | null;
  band: "HIGH" | "MEDIUM" | "LOW" | null;
  status: string;
  rationale: unknown;
  currentClass: string | null;
};

function bandExpr() {
  return sql`CASE
    WHEN a.suggestion_confidence >= 0.90 THEN 'HIGH'
    WHEN a.suggestion_confidence >= 0.70 THEN 'MEDIUM'
    WHEN a.suggestion_confidence IS NOT NULL THEN 'LOW'
    ELSE NULL
  END`;
}

export async function getSuggestionsQueue(filter: {
  entityId?: number; schemaId?: number; dataSourceId?: number;
  band?: "HIGH" | "MEDIUM" | "LOW"; status?: string;
  page?: number; limit?: number;
}): Promise<{ rows: SuggestionRow[]; total: number }> {
  const { entityId, schemaId, dataSourceId, band, status, page = 1, limit = 50 } = filter;
  const offset = (page - 1) * limit;

  const whereEntity = entityId != null ? sql`AND e.entity_id = ${entityId}` : sql``;
  const whereSchema = schemaId != null ? sql`AND s.schema_id = ${schemaId}` : sql``;
  const whereSource = dataSourceId != null ? sql`AND s.data_source_id = ${dataSourceId}` : sql``;
  const whereStatus = status ? sql`AND a.suggestion_status_code = ${status}` : sql`AND a.suggestion_status_code != 'NONE'`;
  const whereBand = band ? sql`AND (${bandExpr()}) = ${band}` : sql``;

  const rows = await sql<SuggestionRow[]>`
    SELECT
      a.attribute_id AS "attributeId", a.physical_name_text AS "physicalName", a.friendly_name_text AS "friendlyName",
      e.entity_id AS "entityId", e.entity_name_text AS "entityName", s.schema_name_text AS "schemaName",
      a.suggested_class_code AS "suggestedClass", a.suggestion_confidence AS confidence,
      (${bandExpr()}) AS band,
      a.suggestion_status_code AS status, a.suggestion_rationale_json AS rationale,
      a.attribute_class_code AS "currentClass"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE 1=1 ${whereEntity} ${whereSchema} ${whereSource} ${whereStatus} ${whereBand}
    ORDER BY a.suggestion_confidence DESC NULLS LAST, a.attribute_id
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ cnt }] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE 1=1 ${whereEntity} ${whereSchema} ${whereSource} ${whereStatus} ${whereBand}
  `;

  return { rows, total: cnt };
}

export async function acceptSuggestion(attributeId: number, userId: string): Promise<void> {
  const [old] = await sql<{ attributeClassCode: string | null; suggestedClassCode: string | null }[]>`
    SELECT attribute_class_code AS "attributeClassCode", suggested_class_code AS "suggestedClassCode"
    FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  if (!old) throw new Error("Attribute not found");
  if (!old.suggestedClassCode) throw new Error("No suggestion to accept");

  await sql`
    UPDATE bayanat.data_attributes SET
      attribute_class_code   = ${old.suggestedClassCode},
      suggestion_status_code = 'ACCEPTED',
      classified_by_user_id  = ${userId},
      classified_at_timestamp = NOW()
    WHERE attribute_id = ${attributeId}
  `;
  // force: true — accepting a suggestion frequently leaves attribute_class_code
  // unchanged from what saveCrawlResults()/a prior run already wrote there while
  // PENDING; the steward's review action must still show up in the history log.
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "attribute_class_code", oldVal: old.attributeClassCode, newVal: old.suggestedClassCode, force: true },
  ]);
}

export async function overrideSuggestion(
  attributeId: number, userId: string, classCode: "BUSINESS" | "TECHNICAL", reason: string,
  addPattern?: { patternGroupCode: string; regex: string; scopeToSource: boolean },
): Promise<void> {
  const [old] = await sql<{ attributeClassCode: string | null; physicalName: string; entityId: number }[]>`
    SELECT attribute_class_code AS "attributeClassCode", physical_name_text AS "physicalName", entity_id AS "entityId"
    FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  if (!old) throw new Error("Attribute not found");
  if (!reason?.trim()) throw new Error("Override reason is required");

  await sql`
    UPDATE bayanat.data_attributes SET
      attribute_class_code   = ${classCode},
      suggestion_status_code = 'OVERRIDDEN',
      classified_by_user_id  = ${userId},
      classified_at_timestamp = NOW()
    WHERE attribute_id = ${attributeId}
  `;
  // "override_reason" isn't a tracked column on data_attributes — recorded as a
  // synthetic field in the same audit entry so the reason shows up alongside the
  // class-code change in the history feed, matching the app's one-entry-per-action convention.
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "attribute_class_code", oldVal: old.attributeClassCode, newVal: classCode, force: true },
    { field: "override_reason", oldVal: null, newVal: reason.trim(), force: true },
  ]);

  if (addPattern) {
    const [{ id: dataSourceId }] = await sql<{ id: number | null }[]>`
      SELECT s.data_source_id AS id FROM bayanat.data_entities e
      JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id WHERE e.entity_id = ${old.entityId}
    `;
    await sql`
      INSERT INTO bayanat.classification_patterns (pattern_group_code, pattern_regex_text, data_source_id, notes_text)
      VALUES (${addPattern.patternGroupCode}, ${addPattern.regex}, ${addPattern.scopeToSource ? dataSourceId : null},
              ${`Added from override of "${old.physicalName}" by steward — ${reason.trim()}`})
    `;
  }
}

export async function bulkAcceptHighBand(
  filter: { entityId?: number; schemaId?: number; dataSourceId?: number },
  userId: string,
  force = false,
): Promise<number> {
  const { rows } = await getSuggestionsQueue({
    ...filter, status: "PENDING", band: force ? undefined : "HIGH", limit: 10000,
  });
  const eligible = force ? rows : rows.filter((r) => r.band === "HIGH");
  for (const row of eligible) {
    await acceptSuggestion(row.attributeId, userId);
  }
  return eligible.length;
}

export async function resetToPending(attributeId: number, userId: string): Promise<void> {
  const [old] = await sql<{ status: string }[]>`
    SELECT suggestion_status_code AS status FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  if (!old) throw new Error("Attribute not found");
  await sql`UPDATE bayanat.data_attributes SET suggestion_status_code = 'PENDING' WHERE attribute_id = ${attributeId}`;
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "suggestion_status_code", oldVal: old.status, newVal: "PENDING", force: true },
  ]);
}
