// Orchestrates a Column Asset-Type classification run: resolves scope, assembles
// context for each attribute from the catalog, calls the pure rule engine
// (lib/column-classifier.ts), and applies the non-destructive write rules from
// the feature spec §4.4. Framework/DB-aware counterpart to the pure engine.

import { sql } from "./db";
import { logUpdate } from "./audit";
import {
  classifyColumn, isSurrogateLooking,
  type ColumnInput, type PatternDictionary, type PatternGroup, type ConfidenceBand,
} from "./column-classifier";

const SYSTEM_ACTOR = "SYSTEM";

export type ScopeType = "DATA_SOURCE" | "SCHEMA" | "ENTITY" | "FULL";
export type ScopeMode = "NEW_ONLY" | "UNCLASSIFIED_ONLY" | "ALL";

export type RunOptions = {
  scopeType: ScopeType;
  scopeId: number | null;
  scopeMode: ScopeMode;
  triggeredByUserId: string;
  autoAcceptBand?: "NONE" | "HIGH";
  inferFkByNaming?: boolean;
  crawlJobId?: number;
};

export type RunSummary = {
  runId: number;
  attributesEvaluated: number;
  suggestionsChanged: number;
  byRule: Record<string, number>;
  byBand: Record<ConfidenceBand, number>;
};

// ── Name-inference FK fallback (spec §2.2b) ────────────────────────────────────
// For sources with no declared FK constraints (or columns the introspector missed),
// infer a link from `x_id`-style naming to a same-schema table `x`/`x`+s with a PK.
// Never downgrades an existing link — INSERT ... ON CONFLICT DO NOTHING — and only
// proposes a link where none exists yet for that column at all.
async function inferNameBasedFkLinks(dataSourceId: number): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.attribute_reference_links
      (fk_attribute_id, referenced_attribute_id, discovery_method_code, confidence_number)
    SELECT DISTINCT a.attribute_id, pk.attribute_id, 'NAME_INFERRED', 0.7
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_entities te ON te.schema_id = e.schema_id AND te.entity_id != e.entity_id
      AND (te.entity_name_text = regexp_replace(a.physical_name_text, '_id$', '')
        OR te.entity_name_text = regexp_replace(a.physical_name_text, '_id$', '') || 's')
    JOIN bayanat.data_attributes pk ON pk.entity_id = te.entity_id AND pk.is_primary_key_indicator = true
    WHERE s.data_source_id = ${dataSourceId}
      AND a.physical_name_text ~* '_id$'
      AND a.is_foreign_key_indicator = false
      AND NOT EXISTS (SELECT 1 FROM bayanat.attribute_reference_links l WHERE l.fk_attribute_id = a.attribute_id)
    ON CONFLICT (fk_attribute_id, referenced_attribute_id) DO NOTHING
    RETURNING fk_attribute_id AS id
  `;
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.id))];
    await sql`UPDATE bayanat.data_attributes SET is_foreign_key_indicator = true WHERE attribute_id = ANY(${ids}) AND is_foreign_key_indicator = false`;
  }
  return rows.length;
}

// ── Scope resolution ────────────────────────────────────────────────────────────

async function resolveScopeAttributeIds(scopeType: ScopeType, scopeId: number | null, scopeMode: ScopeMode): Promise<number[]> {
  const modeFilter = scopeMode === "NEW_ONLY"
    ? sql`AND a.suggestion_status_code = 'NONE'`
    : scopeMode === "UNCLASSIFIED_ONLY"
    ? sql`AND a.attribute_class_code IS NULL AND a.suggestion_status_code NOT IN ('ACCEPTED','OVERRIDDEN')`
    : sql``; // ALL

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

  const rows = await sql<{ id: number }[]>`
    SELECT a.attribute_id AS id
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE ${scopeFilter} ${modeFilter}
  `;
  return rows.map((r) => r.id);
}

async function resolveDataSourceId(scopeType: ScopeType, scopeId: number | null): Promise<number | null> {
  if (scopeType === "DATA_SOURCE") return scopeId;
  if (scopeType === "SCHEMA" && scopeId != null) {
    const [row] = await sql<{ id: number }[]>`SELECT data_source_id AS id FROM bayanat.data_schemas WHERE schema_id = ${scopeId}`;
    return row?.id ?? null;
  }
  if (scopeType === "ENTITY" && scopeId != null) {
    const [row] = await sql<{ id: number }[]>`
      SELECT s.data_source_id AS id FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_id = ${scopeId}
    `;
    return row?.id ?? null;
  }
  return null; // FULL — name-inference skipped, spans multiple sources
}

// ── Pattern dictionary loading ───────────────────────────────────────────────────

async function loadPatterns(dataSourceId: number | null): Promise<PatternDictionary> {
  const rows = await sql<{ group: PatternGroup; regex: string; sourceId: number | null }[]>`
    SELECT pattern_group_code AS group, pattern_regex_text AS regex, data_source_id AS "sourceId"
    FROM bayanat.classification_patterns
    WHERE is_enabled_indicator = true AND (data_source_id IS NULL OR data_source_id = ${dataSourceId})
    ORDER BY data_source_id NULLS FIRST
  `;
  const dict: PatternDictionary = {};
  for (const r of rows) {
    const list = dict[r.group] ?? [];
    try { list.push(new RegExp(r.regex, "i")); } catch { /* invalid regex — skip, don't crash the run */ }
    dict[r.group] = list;
  }
  return dict;
}

// ── Main entry point ─────────────────────────────────────────────────────────────

export async function runColumnClassification(opts: RunOptions): Promise<RunSummary> {
  const [runRow] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.classification_runs (scope_type_code, scope_id, triggered_by_user_id, status_code)
    VALUES (${opts.scopeType}, ${opts.scopeId}, ${opts.triggeredByUserId}, 'RUNNING')
    RETURNING run_id AS id
  `;
  const runId = runRow.id;

  try {
    const dataSourceId = await resolveDataSourceId(opts.scopeType, opts.scopeId);

    let inferredLinks = 0;
    if (opts.inferFkByNaming !== false && dataSourceId != null) {
      inferredLinks = await inferNameBasedFkLinks(dataSourceId);
    }

    const attributeIds = await resolveScopeAttributeIds(opts.scopeType, opts.scopeId, opts.scopeMode);
    const patterns = await loadPatterns(dataSourceId);

    const byRule: Record<string, number> = {};
    const byBand: Record<ConfidenceBand, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    let suggestionsChanged = 0;

    if (attributeIds.length > 0) {
      const attrs = await sql<{
        id: number; name: string; dataType: string; defaultValue: string | null;
        isPrimaryKey: boolean; isForeignKey: boolean;
        entityId: number; categoryCode: string | null;
        attributeClassCode: string | null; suggestedClassCode: string | null;
        suggestionStatus: string; friendlyName: string | null;
      }[]>`
        SELECT
          a.attribute_id AS id, a.physical_name_text AS name, a.data_type_text AS "dataType",
          a.default_value_text AS "defaultValue",
          coalesce(a.is_primary_key_indicator, false) AS "isPrimaryKey",
          coalesce(a.is_foreign_key_indicator, false) AS "isForeignKey",
          a.entity_id AS "entityId", e.entity_category_code AS "categoryCode",
          a.attribute_class_code AS "attributeClassCode", a.suggested_class_code AS "suggestedClassCode",
          a.suggestion_status_code AS "suggestionStatus", a.friendly_name_text AS "friendlyName"
        FROM bayanat.data_attributes a
        JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.attribute_id = ANY(${attributeIds})
      `;

      const entityIds = [...new Set(attrs.map((a) => a.entityId))];
      const pkCountRows = await sql<{ entityId: number; cnt: number }[]>`
        SELECT entity_id AS "entityId", count(*)::int AS cnt FROM bayanat.data_attributes
        WHERE entity_id = ANY(${entityIds}) AND is_primary_key_indicator = true
        GROUP BY entity_id
      `;
      const pkCountByEntity = new Map(pkCountRows.map((r) => [r.entityId, r.cnt]));

      // REFERENCE entities: is each one referenced by >=1 MASTER/TRANSACTIONAL FK?
      const refEntityIds = [...new Set(attrs.filter((a) => a.categoryCode === "REFERENCE").map((a) => a.entityId))];
      const referencedRows = refEntityIds.length === 0 ? [] : await sql<{ entityId: number }[]>`
        SELECT DISTINCT te.entity_id AS "entityId"
        FROM bayanat.attribute_reference_links l
        JOIN bayanat.data_attributes fka ON fka.attribute_id = l.fk_attribute_id
        JOIN bayanat.data_entities fke ON fke.entity_id = fka.entity_id
        JOIN bayanat.data_attributes refa ON refa.attribute_id = l.referenced_attribute_id
        JOIN bayanat.data_entities te ON te.entity_id = refa.entity_id
        WHERE te.entity_id = ANY(${refEntityIds}) AND fke.entity_category_code IN ('MASTER','TRANSACTIONAL')
      `;
      const referencedEntitySet = new Set(referencedRows.map((r) => r.entityId));

      // FK attributes: what does each one's referenced column look like (for R3)?
      const fkAttrIds = attrs.filter((a) => a.isForeignKey).map((a) => a.id);
      const refLinkRows = fkAttrIds.length === 0 ? [] : await sql<{
        fkAttrId: number; discoveryMethod: "INTROSPECTED" | "NAME_INFERRED" | "MANUAL";
        refIsPk: boolean; refPkCount: number; refName: string; refDataType: string; refDefaultValue: string | null;
      }[]>`
        SELECT
          l.fk_attribute_id AS "fkAttrId", l.discovery_method_code AS "discoveryMethod",
          coalesce(refa.is_primary_key_indicator, false) AS "refIsPk",
          (SELECT count(*)::int FROM bayanat.data_attributes x WHERE x.entity_id = refa.entity_id AND x.is_primary_key_indicator = true) AS "refPkCount",
          refa.physical_name_text AS "refName", refa.data_type_text AS "refDataType", refa.default_value_text AS "refDefaultValue"
        FROM bayanat.attribute_reference_links l
        JOIN bayanat.data_attributes refa ON refa.attribute_id = l.referenced_attribute_id
        WHERE l.fk_attribute_id = ANY(${fkAttrIds})
      `;
      const refLinkByFkAttr = new Map(refLinkRows.map((r) => [r.fkAttrId, r]));

      // Glossary match: physical/friendly name equals a term name or alias (normalized).
      const glossaryRows = await sql<{ id: number; termName: string }[]>`
        SELECT a.attribute_id AS id, coalesce(bg.term_name_text, ga.alias_name_text) AS "termName"
        FROM bayanat.data_attributes a
        LEFT JOIN bayanat.business_glossaries bg
          ON lower(replace(bg.term_name_text, ' ', '_')) = lower(a.physical_name_text)
          OR lower(replace(bg.term_name_text, ' ', '_')) = lower(coalesce(a.friendly_name_text, ''))
        LEFT JOIN bayanat.glossary_aliases ga
          ON lower(replace(ga.alias_name_text, ' ', '_')) = lower(a.physical_name_text)
          OR lower(replace(ga.alias_name_text, ' ', '_')) = lower(coalesce(a.friendly_name_text, ''))
        WHERE a.attribute_id = ANY(${attributeIds}) AND (bg.glossary_id IS NOT NULL OR ga.alias_id IS NOT NULL)
      `;
      const glossaryByAttr = new Map(glossaryRows.map((r) => [r.id, r.termName]));

      // Governance signals: active DQ rules OR a CLASSIFICATION-role business term already assigned.
      const governedRows = await sql<{ id: number }[]>`
        SELECT DISTINCT a.attribute_id AS id
        FROM bayanat.data_attributes a
        WHERE a.attribute_id = ANY(${attributeIds}) AND (
          EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true)
          OR EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION')
        )
      `;
      const governedSet = new Set(governedRows.map((r) => r.id));

      for (const attr of attrs) {
        const refLink = refLinkByFkAttr.get(attr.id);
        const input: ColumnInput = {
          name: attr.name, dataType: attr.dataType ?? "", defaultValueText: attr.defaultValue,
          isPrimaryKey: attr.isPrimaryKey, isForeignKey: attr.isForeignKey,
          entity: {
            categoryCode: attr.categoryCode,
            pkColumnCount: pkCountByEntity.get(attr.entityId) ?? 0,
            referencedByMasterOrTransactional: referencedEntitySet.has(attr.entityId),
          },
          referencedColumn: refLink ? {
            isSurrogatePk: refLink.refIsPk && refLink.refPkCount === 1 && isSurrogateLooking({ name: refLink.refName, dataType: refLink.refDataType ?? "", defaultValueText: refLink.refDefaultValue }, patterns),
            discoveryMethod: refLink.discoveryMethod,
          } : null,
          hasGlossaryMatch: glossaryByAttr.has(attr.id),
          glossaryTermName: glossaryByAttr.get(attr.id) ?? null,
          hasGovernanceSignals: governedSet.has(attr.id),
        };

        const result = classifyColumn(input, patterns);
        byRule[result.rationale.terminal_rule] = (byRule[result.rationale.terminal_rule] ?? 0) + 1;
        byBand[result.band]++;

        const changed = attr.suggestedClassCode !== result.suggestedClass;
        if (changed) suggestionsChanged++;

        const rationale = { run_id: runId, ...result.rationale };

        if (attr.suggestionStatus === "ACCEPTED" || attr.suggestionStatus === "OVERRIDDEN") {
          // Non-destructive: never touch attribute_class_code once confirmed. If the
          // freshly-computed suggestion disagrees with the confirmed value, flag STALE
          // for the review queue instead of silently reapplying it.
          const nowDiffers = result.suggestedClass !== attr.attributeClassCode;
          await sql`
            UPDATE bayanat.data_attributes SET
              suggested_class_code = ${result.suggestedClass},
              suggestion_confidence = ${result.confidence},
              suggestion_rationale_json = ${JSON.stringify(rationale)}::jsonb,
              suggestion_status_code = CASE WHEN ${nowDiffers} THEN 'STALE' ELSE suggestion_status_code END
            WHERE attribute_id = ${attr.id}
          `;
        } else {
          const autoAccept = opts.autoAcceptBand === "HIGH" && result.band === "HIGH";
          if (autoAccept) {
            await sql`
              UPDATE bayanat.data_attributes SET
                suggested_class_code = ${result.suggestedClass},
                suggestion_confidence = ${result.confidence},
                suggestion_rationale_json = ${JSON.stringify(rationale)}::jsonb,
                suggestion_status_code = 'ACCEPTED',
                attribute_class_code = ${result.suggestedClass},
                classified_by_user_id = 'SYSTEM:CRAWLER',
                classified_at_timestamp = NOW()
              WHERE attribute_id = ${attr.id}
            `;
            await logUpdate("DATA_ATTRIBUTES", attr.id, SYSTEM_ACTOR, [
              { field: "attribute_class_code", oldVal: attr.attributeClassCode, newVal: result.suggestedClass, force: true },
            ]);
          } else {
            await sql`
              UPDATE bayanat.data_attributes SET
                suggested_class_code = ${result.suggestedClass},
                suggestion_confidence = ${result.confidence},
                suggestion_rationale_json = ${JSON.stringify(rationale)}::jsonb,
                suggestion_status_code = 'PENDING'
              WHERE attribute_id = ${attr.id}
            `;
          }
        }
      }
    }

    await sql`
      UPDATE bayanat.classification_runs SET
        status_code = 'COMPLETED', finished_at = NOW(),
        attributes_evaluated_count = ${attributeIds.length},
        suggestions_changed_count = ${suggestionsChanged},
        summary_json = ${JSON.stringify({ by_rule: byRule, by_band: byBand, name_inferred_links: inferredLinks, crawl_job_id: opts.crawlJobId ?? null })}::jsonb
      WHERE run_id = ${runId}
    `;

    return { runId, attributesEvaluated: attributeIds.length, suggestionsChanged, byRule, byBand };
  } catch (err) {
    await sql`
      UPDATE bayanat.classification_runs SET status_code = 'FAILED', finished_at = NOW(),
        summary_json = ${JSON.stringify({ error: (err as Error).message })}::jsonb
      WHERE run_id = ${runId}
    `;
    throw err;
  }
}
