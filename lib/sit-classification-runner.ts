// Orchestrates a Sensitive Information Type (SIT) classification run: resolves
// scope, loads region-scoped patterns, samples live values where available, calls
// the pure scoring engine (lib/sit-classifier.ts), and applies the same
// non-destructive write rules as the Business/Technical classifier
// (lib/classification-runner.ts) — never touch a steward-confirmed suggestion,
// flag STALE if a rerun disagrees.

import { sql } from "./db";
import { isLiveQueryable, getLiveSampleRows } from "./sample-data";
import { scoreColumnAgainstSit, type SitPattern, type ColumnSitInput } from "./sit-classifier";

export type SitScopeType = "DATA_SOURCE" | "SCHEMA" | "ENTITY" | "FULL";
export type SitScopeMode = "NEW_ONLY" | "ALL";

export type SitRunOptions = {
  scopeType: SitScopeType;
  scopeId: number | null;
  scopeMode: SitScopeMode;
  triggeredByUserId: string;
};

export type SitRunSummary = {
  runId: number;
  attributesEvaluated: number;
  suggestionsChanged: number;
  entitiesSampledLive: number;
  entitiesNameOnly: number;
  byBand: Record<"HIGH" | "MEDIUM" | "LOW", number>;
};

// postgres.js parses date/timestamp columns into real JS Date objects — String(v)
// on one produces a locale-formatted string (e.g. "Thu Mar 14 1985 ..."), not the
// ISO shape any date-pattern regex expects. Format explicitly instead.
function stringifySampleValue(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

type TargetAttribute = {
  id: number;
  name: string;
  friendlyName: string | null;
  description: string | null;
  entityId: number;
  suggestedSitGlossaryId: number | null;
  sitSuggestionStatus: string;
};

// Hard filter: only columns whose Business/Technical classification is already
// CONFIRMED as BUSINESS by a steward. attribute_class_code is only ever populated
// once confirmed (see lib/classification-runner.ts's non-destructive write rule) —
// so this filter alone implements "run against Business assets following steward
// confirmation" without needing to separately check suggestion_status_code.
async function resolveTargetAttributes(scopeType: SitScopeType, scopeId: number | null, scopeMode: SitScopeMode): Promise<TargetAttribute[]> {
  const modeFilter = scopeMode === "NEW_ONLY" ? sql`AND a.sit_suggestion_status_code = 'NONE'` : sql``;

  let scopeFilter;
  if (scopeType === "ENTITY") {
    if (scopeId == null) throw new Error("scopeId is required for ENTITY scope");
    scopeFilter = sql`e.entity_id = ${scopeId}`;
  } else if (scopeType === "SCHEMA") {
    if (scopeId == null) throw new Error("scopeId is required for SCHEMA scope");
    scopeFilter = sql`s.schema_id = ${scopeId}`;
  } else if (scopeType === "DATA_SOURCE") {
    if (scopeId == null) throw new Error("scopeId is required for DATA_SOURCE scope");
    scopeFilter = sql`s.data_source_id = ${scopeId}`;
  } else {
    scopeFilter = sql`true`; // FULL
  }

  return sql<TargetAttribute[]>`
    SELECT
      a.attribute_id AS id, a.physical_name_text AS name, a.friendly_name_text AS "friendlyName",
      a.description_text AS description, a.entity_id AS "entityId",
      a.suggested_sit_glossary_id AS "suggestedSitGlossaryId", a.sit_suggestion_status_code AS "sitSuggestionStatus"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE a.attribute_class_code = 'BUSINESS' AND ${scopeFilter} ${modeFilter}
  `;
}

async function loadActiveSettings() {
  const [row] = await sql<{ activeRegion: string; sampleSize: number; minConfidenceThreshold: number }[]>`
    SELECT active_region_code AS "activeRegion", sample_size AS "sampleSize", min_confidence_threshold AS "minConfidenceThreshold"
    FROM bayanat.sit_settings WHERE settings_id = 1
  `;
  return {
    activeRegion: row.activeRegion,
    sampleSize: row.sampleSize,
    minConfidenceThreshold: Number(row.minConfidenceThreshold),
  };
}

async function loadPatterns(activeRegion: string): Promise<Map<number, SitPattern[]>> {
  const rows = await sql<{ glossaryId: number; patternType: SitPattern["patternType"]; patternText: string; confidenceWeight: number }[]>`
    SELECT glossary_id AS "glossaryId", pattern_type AS "patternType", pattern_text AS "patternText", confidence_weight AS "confidenceWeight"
    FROM bayanat.sit_patterns
    WHERE is_enabled = true AND region_code IN (${activeRegion}, 'GLOBAL')
  `;
  const byTerm = new Map<number, SitPattern[]>();
  for (const r of rows) {
    const list = byTerm.get(r.glossaryId) ?? [];
    list.push({ glossaryId: r.glossaryId, patternType: r.patternType, patternText: r.patternText, confidenceWeight: Number(r.confidenceWeight) });
    byTerm.set(r.glossaryId, list);
  }
  return byTerm;
}

export async function runSitClassification(opts: SitRunOptions): Promise<SitRunSummary> {
  const settings = await loadActiveSettings();

  const [runRow] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.sit_classification_runs (scope_type_code, scope_id, region_code, triggered_by_user_id, status_code)
    VALUES (${opts.scopeType}, ${opts.scopeId}, ${settings.activeRegion}, ${opts.triggeredByUserId}, 'RUNNING')
    RETURNING run_id AS id
  `;
  const runId = runRow.id;

  try {
    const attrs = await resolveTargetAttributes(opts.scopeType, opts.scopeId, opts.scopeMode);
    const patternsByTerm = await loadPatterns(settings.activeRegion);

    const byBand: Record<"HIGH" | "MEDIUM" | "LOW", number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    let suggestionsChanged = 0;
    let entitiesSampledLive = 0;
    let entitiesNameOnly = 0;

    // Group by entity so each table is sampled at most once per run.
    const byEntity = new Map<number, TargetAttribute[]>();
    for (const a of attrs) {
      const list = byEntity.get(a.entityId) ?? [];
      list.push(a);
      byEntity.set(a.entityId, list);
    }

    for (const [entityId, entityAttrs] of byEntity) {
      let valuesByColumn: Map<string, string[]> | null = null;
      const sample = await getLiveSampleRows(entityId, settings.sampleSize);
      if (sample.live) {
        entitiesSampledLive++;
        valuesByColumn = new Map();
        for (const col of sample.columns) {
          const values = sample.rows
            .map((r) => r[col])
            .filter((v) => v != null)
            .map(stringifySampleValue);
          valuesByColumn.set(col, values);
        }
      } else {
        entitiesNameOnly++;
      }

      for (const attr of entityAttrs) {
        const input: ColumnSitInput = {
          name: attr.name,
          friendlyName: attr.friendlyName,
          description: attr.description,
          sampleValues: valuesByColumn?.get(attr.name) ?? [],
        };
        const suggestion = scoreColumnAgainstSit(input, patternsByTerm, settings.minConfidenceThreshold);

        const rationale = suggestion
          ? { run_id: runId, sampled_live: suggestion.sampledLive, hits: suggestion.hits, confidence: suggestion.confidence, band: suggestion.band }
          : { run_id: runId, sampled_live: valuesByColumn != null, note: "no candidate term cleared the confidence threshold" };

        const newGlossaryId = suggestion?.glossaryId ?? null;
        if (suggestion) byBand[suggestion.band]++;

        const changed = attr.suggestedSitGlossaryId !== newGlossaryId;
        if (changed) suggestionsChanged++;

        if (attr.sitSuggestionStatus === "ACCEPTED" || attr.sitSuggestionStatus === "REJECTED") {
          // Non-destructive: never touch a confirmed decision. Flag STALE for the
          // review queue instead of silently reapplying a disagreeing suggestion.
          // ACCEPTED disagrees when the fresh top candidate isn't the confirmed term;
          // REJECTED ("nothing applies here") disagrees when a candidate now appears
          // at all — either way, worth a steward's second look, not silent either way.
          const nowDiffers = attr.sitSuggestionStatus === "ACCEPTED"
            ? newGlossaryId !== attr.suggestedSitGlossaryId
            : newGlossaryId != null;
          await sql`
            UPDATE bayanat.data_attributes SET
              suggested_sit_glossary_id = ${newGlossaryId},
              sit_suggestion_confidence = ${suggestion?.confidence ?? null},
              sit_suggestion_rationale_json = ${JSON.stringify(rationale)}::jsonb,
              sit_suggestion_status_code = CASE WHEN ${nowDiffers} THEN 'STALE' ELSE sit_suggestion_status_code END
            WHERE attribute_id = ${attr.id}
          `;
        } else if (newGlossaryId != null) {
          await sql`
            UPDATE bayanat.data_attributes SET
              suggested_sit_glossary_id = ${newGlossaryId},
              sit_suggestion_confidence = ${suggestion!.confidence},
              sit_suggestion_rationale_json = ${JSON.stringify(rationale)}::jsonb,
              sit_suggestion_status_code = 'PENDING'
            WHERE attribute_id = ${attr.id}
          `;
        } else if (attr.sitSuggestionStatus === "PENDING" || attr.sitSuggestionStatus === "STALE") {
          // Previously suggested, now nothing clears the threshold — clear it back to NONE.
          await sql`
            UPDATE bayanat.data_attributes SET
              suggested_sit_glossary_id = NULL, sit_suggestion_confidence = NULL,
              sit_suggestion_rationale_json = ${JSON.stringify(rationale)}::jsonb,
              sit_suggestion_status_code = 'NONE'
            WHERE attribute_id = ${attr.id}
          `;
        }
      }
    }

    await sql`
      UPDATE bayanat.sit_classification_runs SET
        status_code = 'COMPLETED', finished_at = NOW(),
        attributes_evaluated_count = ${attrs.length},
        suggestions_changed_count = ${suggestionsChanged},
        summary_json = ${JSON.stringify({ by_band: byBand, entities_sampled_live: entitiesSampledLive, entities_name_only: entitiesNameOnly, patterns_loaded_count: [...patternsByTerm.values()].reduce((n, l) => n + l.length, 0) })}::jsonb
      WHERE run_id = ${runId}
    `;

    return { runId, attributesEvaluated: attrs.length, suggestionsChanged, entitiesSampledLive, entitiesNameOnly, byBand };
  } catch (err) {
    await sql`
      UPDATE bayanat.sit_classification_runs SET status_code = 'FAILED', finished_at = NOW(),
        summary_json = ${JSON.stringify({ error: (err as Error).message })}::jsonb
      WHERE run_id = ${runId}
    `;
    throw err;
  }
}
