// AI Metadata Enrichment — context package builder.
// See "Bayanatix - AI Metadata Enrichment Feature Spec.md" §1. Assembles every signal
// the suggestion service (descriptions + DQ rules) needs for one asset (table or
// column) into a single, DB-free-to-consume object. NFR-3 (data protection) is
// enforced here: sample values are only ever populated when the column's *effective*
// classification (via the same asset_business_terms CLASSIFICATION-role join used for
// CDE elsewhere in the app) is PUBLIC/INTERNAL and carries no PI category.

import { sql } from "../db";

export type AssetType = "DATA_ENTITIES" | "DATA_ATTRIBUTES";

/** Validates a raw string against the asset_type_code literal (matches the app's
 *  existing /api/assets/[assetType]/... convention — the URL segment IS the literal). */
export function parseAssetType(value: string): AssetType | null {
  return value === "DATA_ENTITIES" || value === "DATA_ATTRIBUTES" ? value : null;
}

export type FkRef = { columnName: string; refTableName: string; refColumnName: string };
export type InboundFkRef = { fromTableName: string; fromColumnName: string; columnName: string };

export type ProfilingSignal = {
  rowCount: number | null;
  prevRowCount: number | null;
  profiledAt: string | null;
  /** Computed in SQL (NOW() - profiled_at) rather than in JS — profiled_at is a
   *  naive `timestamp` column, and re-parsing it via `new Date(str)` on the Node
   *  side reinterprets it in the server's local timezone, silently skewing any
   *  age comparison against Date.now() (which is always real UTC). */
  profileAgeDays: number | null;
  nullPct: number | null;
  nullCount: number | null;
  distinctCount: number | null;
  minValue: string | null;
  maxValue: string | null;
  topValues: { value: string; count: number }[] | null;
};

export type GlossaryMatch = {
  termName: string;
  definition: string | null;
  formatText: string | null;
  businessRulesText: string | null;
};

export type ContextPackage = {
  assetType: AssetType;
  assetId: number;
  physicalName: string;
  friendlyName: string | null;
  entityId: number;
  entityName: string;
  schemaName: string | null;
  tableCategory: string | null;
  isView: boolean;
  rowCountEstimate: number | null;

  // Column-only structural signals (undefined for DATA_ENTITIES)
  dataType?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  defaultValue?: string | null;
  assetClass?: string | null;

  outboundFks: FkRef[];
  inboundFks: InboundFkRef[];
  siblingColumns: { name: string; dataType: string; friendlyName: string | null }[];

  profiling: ProfilingSignal | null;
  glossaryMatch: GlossaryMatch | null;
  existingDescription: string | null;

  // NFR-3 data-protection gating
  effectiveClassification: string | null;
  isPii: boolean;
  sampleValuesAllowed: boolean;
  sampleValues: string[] | null;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

async function loadGlossaryMatch(physicalName: string, friendlyName: string | null): Promise<GlossaryMatch | null> {
  // Same normalized-name join used by lib/classification-runner.ts's glossary modifier.
  const [row] = await sql<GlossaryMatch[]>`
    SELECT bg.term_name_text AS "termName", bg.definition_text AS definition,
           bg.format_text AS "formatText", bg.business_rules_text AS "businessRulesText"
    FROM bayanat.business_glossaries bg
    WHERE bg.parent_glossary_id IS NOT NULL
      AND (
        lower(replace(bg.term_name_text, ' ', '_')) = ${normalizeName(physicalName)}
        OR (${friendlyName}::text IS NOT NULL AND lower(replace(bg.term_name_text, ' ', '_')) = ${friendlyName ? normalizeName(friendlyName) : null})
      )
    LIMIT 1
  `;
  if (row) return row;

  const [aliasRow] = await sql<GlossaryMatch[]>`
    SELECT bg.term_name_text AS "termName", bg.definition_text AS definition,
           bg.format_text AS "formatText", bg.business_rules_text AS "businessRulesText"
    FROM bayanat.glossary_aliases ga
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = ga.glossary_id
    WHERE lower(replace(ga.alias_name_text, ' ', '_')) = ${normalizeName(physicalName)}
       OR (${friendlyName}::text IS NOT NULL AND lower(replace(ga.alias_name_text, ' ', '_')) = ${friendlyName ? normalizeName(friendlyName) : null})
    LIMIT 1
  `;
  return aliasRow ?? null;
}

async function loadFkTopology(attributeId: number): Promise<{ outboundFks: FkRef[]; inboundFks: InboundFkRef[] }> {
  const outbound = await sql<FkRef[]>`
    SELECT fa.physical_name_text AS "columnName", re.entity_name_text AS "refTableName", ra.physical_name_text AS "refColumnName"
    FROM bayanat.attribute_reference_links l
    JOIN bayanat.data_attributes fa ON fa.attribute_id = l.fk_attribute_id
    JOIN bayanat.data_attributes ra ON ra.attribute_id = l.referenced_attribute_id
    JOIN bayanat.data_entities re ON re.entity_id = ra.entity_id
    WHERE l.fk_attribute_id = ${attributeId}
  `;
  const inbound = await sql<InboundFkRef[]>`
    SELECT fe.entity_name_text AS "fromTableName", fa.physical_name_text AS "fromColumnName", ra.physical_name_text AS "columnName"
    FROM bayanat.attribute_reference_links l
    JOIN bayanat.data_attributes fa ON fa.attribute_id = l.fk_attribute_id
    JOIN bayanat.data_entities fe ON fe.entity_id = fa.entity_id
    JOIN bayanat.data_attributes ra ON ra.attribute_id = l.referenced_attribute_id
    WHERE l.referenced_attribute_id = ${attributeId}
  `;
  return { outboundFks: outbound, inboundFks: inbound };
}

async function loadEntityFkTopology(entityId: number): Promise<{ outboundFks: FkRef[]; inboundFks: InboundFkRef[] }> {
  const outbound = await sql<FkRef[]>`
    SELECT fa.physical_name_text AS "columnName", re.entity_name_text AS "refTableName", ra.physical_name_text AS "refColumnName"
    FROM bayanat.attribute_reference_links l
    JOIN bayanat.data_attributes fa ON fa.attribute_id = l.fk_attribute_id
    JOIN bayanat.data_attributes ra ON ra.attribute_id = l.referenced_attribute_id
    JOIN bayanat.data_entities re ON re.entity_id = ra.entity_id
    WHERE fa.entity_id = ${entityId}
  `;
  const inbound = await sql<InboundFkRef[]>`
    SELECT fe.entity_name_text AS "fromTableName", fa.physical_name_text AS "fromColumnName", ra.physical_name_text AS "columnName"
    FROM bayanat.attribute_reference_links l
    JOIN bayanat.data_attributes fa ON fa.attribute_id = l.fk_attribute_id
    JOIN bayanat.data_entities fe ON fe.entity_id = fa.entity_id
    JOIN bayanat.data_attributes ra ON ra.attribute_id = l.referenced_attribute_id
    WHERE ra.entity_id = ${entityId}
  `;
  return { outboundFks: outbound, inboundFks: inbound };
}

async function loadAttributeProfiling(entityId: number, attributeId: number): Promise<ProfilingSignal | null> {
  const [row] = await sql<{
    rowCount: number | null; prevRowCount: number | null; profiledAt: string | null; profileAgeDays: number | null;
    nullPct: number | null; nullCount: number | null; distinctCount: number | null;
    minValue: string | null; maxValue: string | null; topValues: { value: string; count: number }[] | null;
  }[]>`
    SELECT ep.row_count AS "rowCount", ep.prev_row_count AS "prevRowCount", ep.profiled_at::text AS "profiledAt",
           EXTRACT(EPOCH FROM (NOW() - ep.profiled_at)) / 86400 AS "profileAgeDays",
           ap.null_pct AS "nullPct", ap.null_count AS "nullCount", ap.distinct_count AS "distinctCount",
           ap.min_value AS "minValue", ap.max_value AS "maxValue", ap.top_values AS "topValues"
    FROM bayanat.entity_profile ep
    JOIN bayanat.attribute_profile ap ON ap.profile_id = ep.profile_id AND ap.attribute_id = ${attributeId}
    WHERE ep.entity_id = ${entityId}
    ORDER BY ep.profiled_at DESC
    LIMIT 1
  `;
  if (!row) return null;
  // Some existing attribute_profile rows have top_values double-JSON-encoded (a
  // pre-existing lib/crawler.ts persistence quirk, unrelated to this feature) —
  // tolerate both shapes rather than crash the context builder.
  if (typeof row.topValues === "string") {
    try { row.topValues = JSON.parse(row.topValues); } catch { row.topValues = null; }
  }
  return coerceProfilingBigints(row);
}

// bigint columns (row_count, prev_row_count, null_count, distinct_count) come back
// from postgres.js as native JS BigInt (see lib/db.ts `types: { bigint: postgres.BigInt }`)
// — safe to downcast at our scale, and JSON.stringify can't serialize a raw BigInt,
// which every downstream consumer here eventually does (jsonb inserts, API responses).
function coerceProfilingBigints(row: ProfilingSignal): ProfilingSignal {
  return {
    ...row,
    rowCount: row.rowCount != null ? Number(row.rowCount) : null,
    prevRowCount: row.prevRowCount != null ? Number(row.prevRowCount) : null,
    nullCount: row.nullCount != null ? Number(row.nullCount) : null,
    distinctCount: row.distinctCount != null ? Number(row.distinctCount) : null,
    profileAgeDays: row.profileAgeDays != null ? Number(row.profileAgeDays) : null,
  };
}

async function loadEntityProfiling(entityId: number): Promise<ProfilingSignal | null> {
  const [row] = await sql<{ rowCount: number | null; prevRowCount: number | null; profiledAt: string | null; profileAgeDays: number | null }[]>`
    SELECT row_count AS "rowCount", prev_row_count AS "prevRowCount", profiled_at::text AS "profiledAt",
           EXTRACT(EPOCH FROM (NOW() - profiled_at)) / 86400 AS "profileAgeDays"
    FROM bayanat.entity_profile WHERE entity_id = ${entityId}
    ORDER BY profiled_at DESC LIMIT 1
  `;
  if (!row) return null;
  return coerceProfilingBigints({ ...row, nullPct: null, nullCount: null, distinctCount: null, minValue: null, maxValue: null, topValues: null });
}

async function loadEffectiveClassification(attributeId: number): Promise<{ classification: string | null; isPii: boolean }> {
  const [row] = await sql<{ classification: string | null; isPii: boolean | null }[]>`
    SELECT bg.classification_code AS classification, bg.is_pii_indicator AS "isPii"
    FROM bayanat.asset_business_terms abt
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = ${attributeId} AND abt.term_role = 'CLASSIFICATION'
    LIMIT 1
  `;
  return { classification: row?.classification ?? null, isPii: !!row?.isPii };
}

const SAMPLE_SAFE_CLASSIFICATIONS = new Set(["PUBLIC", "INTERNAL"]);

export async function buildContextPackage(assetType: AssetType, assetId: number): Promise<ContextPackage | null> {
  if (assetType === "DATA_ENTITIES") {
    const [entity] = await sql<{
      entityId: number; entityName: string; schemaName: string | null; category: string | null;
      isView: boolean; rowCount: number | null; description: string | null;
    }[]>`
      SELECT e.entity_id AS "entityId", e.entity_name_text AS "entityName", s.schema_name_text AS "schemaName",
             e.entity_category_code AS category, coalesce(e.is_view_indicator, false) AS "isView",
             e.row_count_estimate AS "rowCount", e.description_text AS description
      FROM bayanat.data_entities e
      LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_id = ${assetId}
    `;
    if (!entity) return null;

    const siblingColumns = await sql<{ name: string; dataType: string; friendlyName: string | null }[]>`
      SELECT physical_name_text AS name, data_type_text AS "dataType", friendly_name_text AS "friendlyName"
      FROM bayanat.data_attributes WHERE entity_id = ${assetId} ORDER BY attribute_id
    `;
    const { outboundFks, inboundFks } = await loadEntityFkTopology(assetId);
    const profiling = await loadEntityProfiling(assetId);

    return {
      assetType, assetId, physicalName: entity.entityName, friendlyName: null,
      entityId: entity.entityId, entityName: entity.entityName, schemaName: entity.schemaName,
      tableCategory: entity.category, isView: entity.isView, rowCountEstimate: entity.rowCount,
      outboundFks, inboundFks, siblingColumns,
      profiling, glossaryMatch: null, existingDescription: entity.description,
      effectiveClassification: null, isPii: false, sampleValuesAllowed: false, sampleValues: null,
    };
  }

  // DATA_ATTRIBUTES
  const [attr] = await sql<{
    attributeId: number; physicalName: string; friendlyName: string | null; dataType: string;
    isPrimaryKey: boolean; isForeignKey: boolean; isNullable: boolean; defaultValue: string | null;
    assetClass: string | null; description: string | null;
    entityId: number; entityName: string; schemaName: string | null; category: string | null;
    isView: boolean; rowCount: number | null;
  }[]>`
    SELECT a.attribute_id AS "attributeId", a.physical_name_text AS "physicalName", a.friendly_name_text AS "friendlyName",
           a.data_type_text AS "dataType", coalesce(a.is_primary_key_indicator, false) AS "isPrimaryKey",
           coalesce(a.is_foreign_key_indicator, false) AS "isForeignKey", coalesce(a.is_nullable_indicator, true) AS "isNullable",
           a.default_value_text AS "defaultValue", a.attribute_class_code AS "assetClass", a.description_text AS description,
           e.entity_id AS "entityId", e.entity_name_text AS "entityName", s.schema_name_text AS "schemaName",
           e.entity_category_code AS category, coalesce(e.is_view_indicator, false) AS "isView", e.row_count_estimate AS "rowCount"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE a.attribute_id = ${assetId}
  `;
  if (!attr) return null;

  const siblingColumns = await sql<{ name: string; dataType: string; friendlyName: string | null }[]>`
    SELECT physical_name_text AS name, data_type_text AS "dataType", friendly_name_text AS "friendlyName"
    FROM bayanat.data_attributes WHERE entity_id = ${attr.entityId} AND attribute_id != ${assetId} ORDER BY attribute_id
  `;
  const { outboundFks, inboundFks } = await loadFkTopology(assetId);
  const profiling = await loadAttributeProfiling(attr.entityId, assetId);
  const glossaryMatch = await loadGlossaryMatch(attr.physicalName, attr.friendlyName);
  const { classification, isPii } = await loadEffectiveClassification(assetId);

  const sampleValuesAllowed =
    !isPii && (classification === null || SAMPLE_SAFE_CLASSIFICATIONS.has(classification));
  const sampleValues = sampleValuesAllowed && profiling?.topValues
    ? profiling.topValues.slice(0, 10).map((v) => v.value)
    : null;

  return {
    assetType, assetId, physicalName: attr.physicalName, friendlyName: attr.friendlyName,
    entityId: attr.entityId, entityName: attr.entityName, schemaName: attr.schemaName,
    tableCategory: attr.category, isView: attr.isView, rowCountEstimate: attr.rowCount,
    dataType: attr.dataType, isPrimaryKey: attr.isPrimaryKey, isForeignKey: attr.isForeignKey,
    isNullable: attr.isNullable, defaultValue: attr.defaultValue, assetClass: attr.assetClass,
    outboundFks, inboundFks, siblingColumns,
    profiling, glossaryMatch, existingDescription: attr.description,
    effectiveClassification: classification, isPii, sampleValuesAllowed, sampleValues,
  };
}
