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

// ── SIT Type catalog ────────────────────────────────────────────────────────────
// A standalone taxonomy (National ID, Email Address, IBAN, ...), decoupled from
// Business Glossary terms and from any tag. "Adding SIT to a business term" means
// creating a row in business_term_sit_types below, NOT tagging with a fixed name.

export type SitType = { sitTypeId: number; sitName: string; classificationCode: string | null; description: string | null; patternCount: number };

export async function getSitTypes(): Promise<SitType[]> {
  return sql<SitType[]>`
    SELECT st.sit_type_id AS "sitTypeId", st.sit_name AS "sitName", st.classification_code AS "classificationCode",
           st.description, count(sp.pattern_id)::int AS "patternCount"
    FROM bayanat.sit_types st
    LEFT JOIN bayanat.sit_patterns sp ON sp.sit_type_id = st.sit_type_id
    GROUP BY st.sit_type_id, st.sit_name, st.classification_code, st.description
    ORDER BY st.sit_name
  `;
}

export async function createSitType(input: { sitName: string; classificationCode: string | null; description: string | null }): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
    VALUES (${input.sitName}, ${input.classificationCode}, ${input.description})
    RETURNING sit_type_id AS id
  `;
  return row.id;
}

export async function updateSitType(sitTypeId: number, patch: { sitName?: string; classificationCode?: string | null; description?: string | null }): Promise<void> {
  await sql`
    UPDATE bayanat.sit_types SET
      sit_name             = coalesce(${patch.sitName ?? null}, sit_name),
      classification_code  = CASE WHEN ${patch.classificationCode !== undefined} THEN ${patch.classificationCode ?? null} ELSE classification_code END,
      description          = CASE WHEN ${patch.description !== undefined} THEN ${patch.description ?? null} ELSE description END
    WHERE sit_type_id = ${sitTypeId}
  `;
}

export async function deleteSitType(sitTypeId: number): Promise<void> {
  await sql`DELETE FROM bayanat.sit_types WHERE sit_type_id = ${sitTypeId}`;
}

export type SitPatternRow = {
  patternId: number;
  sitTypeId: number;
  regionCode: string;
  patternType: "NAME_REGEX" | "VALUE_REGEX" | "CHECKSUM";
  patternText: string;
  confidenceWeight: number;
  isEnabled: boolean;
  notesText: string | null;
};

export async function getSitPatternsForType(sitTypeId: number): Promise<SitPatternRow[]> {
  const rows = await sql<(Omit<SitPatternRow, "confidenceWeight"> & { confidenceWeight: string })[]>`
    SELECT pattern_id AS "patternId", sit_type_id AS "sitTypeId", region_code AS "regionCode",
           pattern_type AS "patternType", pattern_text AS "patternText", confidence_weight AS "confidenceWeight",
           is_enabled AS "isEnabled", notes_text AS "notesText"
    FROM bayanat.sit_patterns WHERE sit_type_id = ${sitTypeId} ORDER BY region_code, pattern_type
  `;
  return rows.map((r) => ({ ...r, confidenceWeight: Number(r.confidenceWeight) }));
}

export async function createSitPattern(input: {
  sitTypeId: number; regionCode: string; patternType: "NAME_REGEX" | "VALUE_REGEX" | "CHECKSUM";
  patternText: string; confidenceWeight: number; notesText: string | null;
}): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.sit_patterns (sit_type_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
    VALUES (${input.sitTypeId}, ${input.regionCode}, ${input.patternType}, ${input.patternText}, ${input.confidenceWeight}, ${input.notesText})
    RETURNING pattern_id AS id
  `;
  return row.id;
}

export async function updateSitPattern(patternId: number, patch: {
  regionCode?: string; patternType?: "NAME_REGEX" | "VALUE_REGEX" | "CHECKSUM";
  patternText?: string; confidenceWeight?: number; isEnabled?: boolean; notesText?: string | null;
}): Promise<void> {
  await sql`
    UPDATE bayanat.sit_patterns SET
      region_code       = coalesce(${patch.regionCode ?? null}, region_code),
      pattern_type      = coalesce(${patch.patternType ?? null}, pattern_type),
      pattern_text      = coalesce(${patch.patternText ?? null}, pattern_text),
      confidence_weight = coalesce(${patch.confidenceWeight ?? null}, confidence_weight),
      is_enabled        = coalesce(${patch.isEnabled ?? null}, is_enabled),
      notes_text        = CASE WHEN ${patch.notesText !== undefined} THEN ${patch.notesText ?? null} ELSE notes_text END
    WHERE pattern_id = ${patternId}
  `;
}

export async function deleteSitPattern(patternId: number): Promise<void> {
  await sql`DELETE FROM bayanat.sit_patterns WHERE pattern_id = ${patternId}`;
}

// ── Business term ↔ SIT type association ("adding SIT to a business term") ────

export async function getBusinessTermSitTypes(glossaryId: number): Promise<SitType[]> {
  return sql<SitType[]>`
    SELECT st.sit_type_id AS "sitTypeId", st.sit_name AS "sitName", st.classification_code AS "classificationCode",
           st.description, count(sp.pattern_id)::int AS "patternCount"
    FROM bayanat.business_term_sit_types bts
    JOIN bayanat.sit_types st ON st.sit_type_id = bts.sit_type_id
    LEFT JOIN bayanat.sit_patterns sp ON sp.sit_type_id = st.sit_type_id
    WHERE bts.glossary_id = ${glossaryId}
    GROUP BY st.sit_type_id, st.sit_name, st.classification_code, st.description
    ORDER BY st.sit_name
  `;
}

// Picker save — delete+insert, same shape as the generic Tags PUT endpoint.
export async function setBusinessTermSitTypes(glossaryId: number, sitTypeIds: number[], userId: string): Promise<void> {
  await sql`DELETE FROM bayanat.business_term_sit_types WHERE glossary_id = ${glossaryId}`;
  for (const sitTypeId of sitTypeIds) {
    await sql`
      INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id, assigned_by)
      VALUES (${glossaryId}, ${sitTypeId}, ${userId})
      ON CONFLICT DO NOTHING
    `;
  }
}

export type SitTypeSuggestion = { sitTypeId: number; sitName: string; confidence: number; evidence: string[] };

// Suggests which SIT type(s) best fit a business term — a lightweight, on-demand
// helper (no persisted suggestion/review queue; the real governance checkpoint is
// already at the column level). Scores every catalog SIT type's NAME_REGEX
// patterns against (a) the term's own name/definition and (b) the physical/
// friendly names of columns already linked to this term via asset_business_terms
// (any role) — i.e. exactly the signal the request asked for: "based on the name
// of the term and/or based on the names of columns associated with the term."
export async function suggestSitTypesForTerm(glossaryId: number): Promise<SitTypeSuggestion[]> {
  const [term] = await sql<{ termName: string; definition: string | null }[]>`
    SELECT term_name_text AS "termName", definition_text AS "definition" FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  if (!term) return [];

  const columnRows = await sql<{ physicalName: string; friendlyName: string | null }[]>`
    SELECT DISTINCT a.physical_name_text AS "physicalName", a.friendly_name_text AS "friendlyName"
    FROM bayanat.asset_business_terms abt
    JOIN bayanat.data_attributes a ON a.attribute_id = abt.asset_id
    WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.glossary_id = ${glossaryId}
  `;

  const nameCandidates = [
    term.termName,
    term.definition,
    ...columnRows.flatMap((c) => [c.physicalName, c.friendlyName]),
  ].filter((v): v is string => !!v);

  const patternRows = await sql<{ sitTypeId: number; sitName: string; patternText: string; confidenceWeight: number }[]>`
    SELECT sp.sit_type_id AS "sitTypeId", st.sit_name AS "sitName", sp.pattern_text AS "patternText", sp.confidence_weight AS "confidenceWeight"
    FROM bayanat.sit_patterns sp
    JOIN bayanat.sit_types st ON st.sit_type_id = sp.sit_type_id
    WHERE sp.is_enabled = true AND sp.pattern_type = 'NAME_REGEX'
  `;

  const bySitType = new Map<number, { sitName: string; score: number; evidence: string[] }>();
  for (const p of patternRows) {
    let re: RegExp;
    try { re = new RegExp(p.patternText, "i"); } catch { continue; }
    for (const candidate of nameCandidates) {
      if (re.test(candidate)) {
        const entry = bySitType.get(p.sitTypeId) ?? { sitName: p.sitName, score: 0, evidence: [] };
        const weight = Number(p.confidenceWeight);
        entry.score = Math.min(1, entry.score + weight);
        entry.evidence.push(`"${candidate}" matches /${p.patternText}/`);
        bySitType.set(p.sitTypeId, entry);
      }
    }
  }

  return [...bySitType.entries()]
    .map(([sitTypeId, v]) => ({ sitTypeId, sitName: v.sitName, confidence: Math.round(v.score * 1000) / 1000, evidence: [...new Set(v.evidence)] }))
    .sort((a, b) => b.confidence - a.confidence);
}

export type SitTermOption = { glossaryId: number; termName: string; classificationCode: string | null; patternCount: number };

// Business terms eligible for the steward "reassign" dropdown on a column
// suggestion — terms associated with a SIT type that has >=1 enabled pattern for
// the given region (GLOBAL patterns always count), per "region controls which
// list of terms."
export async function getSitTermsForRegion(regionCode: string): Promise<SitTermOption[]> {
  return sql<SitTermOption[]>`
    SELECT g.glossary_id AS "glossaryId", g.term_name_text AS "termName", g.classification_code AS "classificationCode",
           count(p.pattern_id)::int AS "patternCount"
    FROM bayanat.business_glossaries g
    JOIN bayanat.business_term_sit_types bts ON bts.glossary_id = g.glossary_id
    JOIN bayanat.sit_patterns p ON p.sit_type_id = bts.sit_type_id AND p.is_enabled = true AND p.region_code IN (${regionCode}, 'GLOBAL')
    GROUP BY g.glossary_id, g.term_name_text, g.classification_code
    HAVING count(p.pattern_id) > 0
    ORDER BY g.term_name_text
  `;
}
