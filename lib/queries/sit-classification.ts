import { sql } from "../db";
import { logUpdate } from "../audit";

export type SitSuggestionRow = {
  attributeId: number;
  physicalName: string;
  friendlyName: string | null;
  entityId: number;
  entityName: string;
  schemaId: number;
  schemaName: string;
  dataSourceId: number;
  sourceName: string;
  suggestedGlossaryId: number | null;
  suggestedTermName: string | null;
  confidence: number | null;
  band: "HIGH" | "MEDIUM" | "LOW" | null;
  status: string;
  rationale: unknown;
  currentGlossaryId: number | null;
  currentTermName: string | null;
};

function bandExpr() {
  return sql`CASE
    WHEN a.sit_suggestion_confidence >= 0.85 THEN 'HIGH'
    WHEN a.sit_suggestion_confidence >= 0.50 THEN 'MEDIUM'
    WHEN a.sit_suggestion_confidence IS NOT NULL THEN 'LOW'
    ELSE NULL
  END`;
}

export async function getSitSuggestionsQueue(filter: {
  entityId?: number; schemaId?: number; dataSourceId?: number;
  band?: "HIGH" | "MEDIUM" | "LOW"; status?: string;
  page?: number; limit?: number;
}): Promise<{ rows: SitSuggestionRow[]; total: number }> {
  const { entityId, schemaId, dataSourceId, band, status, page = 1, limit = 50 } = filter;
  const offset = (page - 1) * limit;

  const whereEntity = entityId != null ? sql`AND e.entity_id = ${entityId}` : sql``;
  const whereSchema = schemaId != null ? sql`AND s.schema_id = ${schemaId}` : sql``;
  const whereSource = dataSourceId != null ? sql`AND s.data_source_id = ${dataSourceId}` : sql``;
  const whereStatus = status ? sql`AND a.sit_suggestion_status_code = ${status}` : sql`AND a.sit_suggestion_status_code != 'NONE'`;
  const whereBand = band ? sql`AND (${bandExpr()}) = ${band}` : sql``;

  const rows = await sql<SitSuggestionRow[]>`
    SELECT
      a.attribute_id AS "attributeId", a.physical_name_text AS "physicalName", a.friendly_name_text AS "friendlyName",
      e.entity_id AS "entityId", e.entity_name_text AS "entityName", s.schema_id AS "schemaId", s.schema_name_text AS "schemaName",
      src.data_source_id AS "dataSourceId", src.source_name_text AS "sourceName",
      a.suggested_sit_glossary_id AS "suggestedGlossaryId", sg.term_name_text AS "suggestedTermName",
      a.sit_suggestion_confidence AS confidence, (${bandExpr()}) AS band,
      a.sit_suggestion_status_code AS status, a.sit_suggestion_rationale_json AS rationale,
      cg.glossary_id AS "currentGlossaryId", cg.term_name_text AS "currentTermName"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources src ON src.data_source_id = s.data_source_id
    LEFT JOIN bayanat.business_glossaries sg ON sg.glossary_id = a.suggested_sit_glossary_id
    LEFT JOIN bayanat.asset_business_terms abt ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries cg ON cg.glossary_id = abt.glossary_id
    WHERE 1=1 ${whereEntity} ${whereSchema} ${whereSource} ${whereStatus} ${whereBand}
    ORDER BY a.sit_suggestion_confidence DESC NULLS LAST, a.attribute_id
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

async function applyClassificationTerm(attributeId: number, glossaryId: number, userId: string): Promise<void> {
  const [term] = await sql<{ classificationCode: string | null }[]>`
    SELECT classification_code AS "classificationCode" FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  if (!term) throw new Error("Term not found");

  // DELETE-then-INSERT, not a true upsert — matches the existing reclassify pattern
  // (app/api/open-data/datasets/[id]/reclassify/route.ts), since the CLASSIFICATION
  // role's uniqueness is a partial index (idx_abt_classification_unique) that ON
  // CONFLICT can't target directly.
  await sql`
    DELETE FROM bayanat.asset_business_terms
    WHERE asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ${attributeId} AND term_role = 'CLASSIFICATION'
  `;
  await sql`
    INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role)
    VALUES (${glossaryId}, 'DATA_ATTRIBUTES', ${attributeId}, ${userId}, 'CLASSIFICATION')
    ON CONFLICT DO NOTHING
  `;

  const [old] = await sql<{ classificationCode: string | null }[]>`
    SELECT classification_code AS "classificationCode" FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  await sql`UPDATE bayanat.data_attributes SET classification_code = ${term.classificationCode} WHERE attribute_id = ${attributeId}`;
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "classification_code", oldVal: old?.classificationCode ?? null, newVal: term.classificationCode, force: true },
  ]);
}

export async function acceptSitSuggestion(attributeId: number, userId: string): Promise<void> {
  const [attr] = await sql<{ suggestedGlossaryId: number | null }[]>`
    SELECT suggested_sit_glossary_id AS "suggestedGlossaryId" FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  if (!attr) throw new Error("Attribute not found");
  if (!attr.suggestedGlossaryId) throw new Error("No suggestion to accept");

  await applyClassificationTerm(attributeId, attr.suggestedGlossaryId, userId);
  await sql`
    UPDATE bayanat.data_attributes SET
      sit_suggestion_status_code = 'ACCEPTED', sit_classified_by_user_id = ${userId}, sit_classified_at_timestamp = NOW()
    WHERE attribute_id = ${attributeId}
  `;
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "sit_suggestion_status_code", oldVal: "PENDING", newVal: "ACCEPTED", force: true },
  ]);
}

// Steward picks a different SIT term than the one suggested — same write path as
// accept, just against a steward-chosen glossaryId. Lands in ACCEPTED, not a
// separate status: the term is confirmed either way, only its origin differs
// (captured in the audit reason, not a distinct enum value).
export async function reassignSitSuggestion(attributeId: number, userId: string, glossaryId: number, reason: string): Promise<void> {
  if (!reason?.trim()) throw new Error("Reason is required");
  await applyClassificationTerm(attributeId, glossaryId, userId);
  await sql`
    UPDATE bayanat.data_attributes SET
      suggested_sit_glossary_id = ${glossaryId}, sit_suggestion_status_code = 'ACCEPTED',
      sit_classified_by_user_id = ${userId}, sit_classified_at_timestamp = NOW()
    WHERE attribute_id = ${attributeId}
  `;
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "sit_suggestion_status_code", oldVal: "PENDING", newVal: "ACCEPTED", force: true },
    { field: "sit_reassign_reason", oldVal: null, newVal: reason.trim(), force: true },
  ]);
}

// Sticky rejection — "not sensitive at all," not a different value. No
// asset_business_terms write. A future rerun still refreshes the suggestion
// fields for visibility but flags STALE instead of resurfacing it for re-review
// (see lib/sit-classification-runner.ts's non-destructive write rule).
export async function rejectSitSuggestion(attributeId: number, userId: string, reason: string): Promise<void> {
  if (!reason?.trim()) throw new Error("Reason is required");
  const [old] = await sql<{ status: string }[]>`SELECT sit_suggestion_status_code AS status FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}`;
  if (!old) throw new Error("Attribute not found");

  await sql`
    UPDATE bayanat.data_attributes SET
      sit_suggestion_status_code = 'REJECTED', sit_classified_by_user_id = ${userId}, sit_classified_at_timestamp = NOW()
    WHERE attribute_id = ${attributeId}
  `;
  await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
    { field: "sit_suggestion_status_code", oldVal: old.status, newVal: "REJECTED", force: true },
    { field: "sit_reject_reason", oldVal: null, newVal: reason.trim(), force: true },
  ]);
}

export async function bulkAcceptSitByIds(attributeIds: number[], userId: string): Promise<number[]> {
  const rows = await sql<{ attributeId: number; status: string }[]>`
    SELECT attribute_id AS "attributeId", sit_suggestion_status_code AS status
    FROM bayanat.data_attributes WHERE attribute_id = ANY(${attributeIds})
  `;
  const accepted: number[] = [];
  for (const r of rows) {
    if (r.status !== "PENDING" && r.status !== "STALE") continue;
    await acceptSitSuggestion(r.attributeId, userId);
    accepted.push(r.attributeId);
  }
  return accepted;
}

// ── Settings (singleton, mirrors lib/enrichment/suggestion-service.ts) ────────

export type SitSettings = {
  activeRegionCode: string;
  sampleSize: number;
  minConfidenceThreshold: number;
  autoAcceptBand: "NONE" | "HIGH";
};

export async function getSitSettings(): Promise<SitSettings> {
  const [row] = await sql<{ activeRegionCode: string; sampleSize: number; minConfidenceThreshold: number; autoAcceptBand: "NONE" | "HIGH" }[]>`
    SELECT active_region_code AS "activeRegionCode", sample_size AS "sampleSize",
           min_confidence_threshold AS "minConfidenceThreshold", auto_accept_band AS "autoAcceptBand"
    FROM bayanat.sit_settings WHERE settings_id = 1
  `;
  return { ...row, minConfidenceThreshold: Number(row.minConfidenceThreshold) };
}

export async function updateSitSettings(patch: Partial<SitSettings>): Promise<void> {
  await sql`
    UPDATE bayanat.sit_settings SET
      active_region_code       = coalesce(${patch.activeRegionCode ?? null}, active_region_code),
      sample_size               = coalesce(${patch.sampleSize ?? null}, sample_size),
      min_confidence_threshold  = coalesce(${patch.minConfidenceThreshold ?? null}, min_confidence_threshold),
      auto_accept_band          = coalesce(${patch.autoAcceptBand ?? null}, auto_accept_band)
    WHERE settings_id = 1
  `;
}

export type SitRegion = { regionCode: string; regionNameText: string };

export async function getSitRegions(): Promise<SitRegion[]> {
  return sql<SitRegion[]>`SELECT region_code AS "regionCode", region_name_text AS "regionNameText" FROM bayanat.sit_regions ORDER BY region_code`;
}

export type SitTermOption = { glossaryId: number; termName: string; classificationCode: string | null; patternCount: number };

// Terms eligible for the steward "reassign" dropdown / the settings-page pattern
// list — SIT-flagged terms that actually have >=1 enabled pattern for the given
// region (GLOBAL patterns always count), per "region controls which list of terms."
export async function getSitTermsForRegion(regionCode: string): Promise<SitTermOption[]> {
  return sql<SitTermOption[]>`
    SELECT g.glossary_id AS "glossaryId", g.term_name_text AS "termName", g.classification_code AS "classificationCode",
           count(p.pattern_id)::int AS "patternCount"
    FROM bayanat.business_glossaries g
    JOIN bayanat.sit_patterns p ON p.glossary_id = g.glossary_id AND p.is_enabled = true AND p.region_code IN (${regionCode}, 'GLOBAL')
    WHERE g.is_sit_indicator = true
    GROUP BY g.glossary_id, g.term_name_text, g.classification_code
    HAVING count(p.pattern_id) > 0
    ORDER BY g.term_name_text
  `;
}
