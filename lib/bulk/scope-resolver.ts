// Bulk Download — resolves a download scope (spec §2.1) into row datasets per sheet.
// Row shapes are keyed by the FieldDef.key values from lib/bulk/sheets.ts so the
// workbook writer can iterate generically.

import { sql } from "../db";
import type { SheetName } from "./sheets";

export type DownloadScope =
  | { type: "DATA_SOURCE"; dataSourceId: number; includeTables?: boolean; includeColumns?: boolean }
  | { type: "SELECTED"; entityIds?: number[]; attributeIds?: number[] }
  | { type: "SEARCH_RESULTS"; refs: { assetType: string; assetId: number }[] }
  | { type: "BUSINESS_TERMS_ALL" }
  | { type: "BUSINESS_TERMS_DOMAIN"; domainId: number }
  | { type: "CUSTOM_ASSETS_BY_TYPE"; typeId: number }
  | { type: "CUSTOM_ASSET_LINKS_BY_REL_TYPE"; relTypeId: number };

export type SheetRows = Partial<Record<SheetName, Record<string, unknown>[]>>;

async function fetchDataSourceRows(dataSourceIds: number[]): Promise<Record<string, unknown>[]> {
  if (dataSourceIds.length === 0) return [];
  return sql<Record<string, unknown>[]>`
    SELECT
      ds.data_source_id AS "_ID", 'DATA_SOURCES' AS "_TYPE",
      ds.source_name_text AS "sourceName", ds.source_type_code AS "sourceType",
      ds.description_text AS description, ds.business_app_name AS "businessAppName",
      (SELECT count(*)::int FROM bayanat.data_schemas s WHERE s.data_source_id = ds.data_source_id) AS "schemaCount",
      (SELECT count(*)::int FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id WHERE s.data_source_id = ds.data_source_id) AS "tableCount"
    FROM bayanat.data_sources ds
    WHERE ds.data_source_id = ANY(${dataSourceIds})
    ORDER BY ds.source_name_text
  `;
}

async function fetchTableRows(entityIds: number[]): Promise<Record<string, unknown>[]> {
  if (entityIds.length === 0) return [];
  return sql<Record<string, unknown>[]>`
    SELECT
      e.entity_id AS "_ID", 'DATA_ENTITIES' AS "_TYPE",
      ds.source_name_text AS "sourceName", s.schema_name_text AS "schemaName", e.entity_name_text AS "tableName",
      e.display_name_text AS "friendlyName", e.description_text AS description, e.entity_category_code AS category,
      coalesce((SELECT string_agg(t.tag_name, '; ') FROM bayanat.asset_tags at2 JOIN bayanat.tags t ON t.tag_id = at2.tag_id
                WHERE at2.asset_type_code = 'DATA_ENTITIES' AND at2.asset_id = e.entity_id), '') AS tags,
      coalesce(e.is_view_indicator, false) AS "isView", e.row_count_estimate AS "rowCount",
      (SELECT count(*)::int FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ENTITIES' AND r.asset_id = e.entity_id) AS "dqRuleCount",
      e.trust_score AS "trustScore"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ANY(${entityIds})
    ORDER BY ds.source_name_text, s.schema_name_text, e.entity_name_text
  `;
}

async function fetchColumnRows(attributeIds: number[]): Promise<Record<string, unknown>[]> {
  if (attributeIds.length === 0) return [];
  return sql<Record<string, unknown>[]>`
    SELECT
      a.attribute_id AS "_ID", 'DATA_ATTRIBUTES' AS "_TYPE",
      ds.source_name_text AS "sourceName", s.schema_name_text AS "schemaName", e.entity_name_text AS "tableName",
      a.physical_name_text AS "columnName", a.data_type_text AS "dataType",
      a.friendly_name_text AS "friendlyName", a.description_text AS description, a.attribute_class_code AS "columnType",
      a.glossary_term_text AS "glossaryTerm", coalesce(a.is_encrypted, false) AS "isEncrypted",
      coalesce((SELECT string_agg(t.tag_name, '; ') FROM bayanat.asset_tags at2 JOIN bayanat.tags t ON t.tag_id = at2.tag_id
                WHERE at2.asset_type_code = 'DATA_ATTRIBUTES' AND at2.asset_id = a.attribute_id), '') AS tags,
      coalesce(a.is_primary_key_indicator, false) AS "isPrimaryKey", coalesce(a.is_nullable_indicator, true) AS "isNullable",
      (SELECT count(*)::int FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id) AS "dqRuleCount",
      a.quality_score AS "qualityScore", a.null_percentage AS "nullPct"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE a.attribute_id = ANY(${attributeIds})
    ORDER BY ds.source_name_text, s.schema_name_text, e.entity_name_text, a.attribute_id
  `;
}

async function fetchBusinessTermRows(domainId: number | null): Promise<Record<string, unknown>[]> {
  const whereDomain = domainId != null
    ? sql`AND bg.glossary_id IN (
        WITH RECURSIVE subtree AS (
          SELECT glossary_id FROM bayanat.business_glossaries WHERE glossary_id = ${domainId}
          UNION ALL
          SELECT c.glossary_id FROM bayanat.business_glossaries c JOIN subtree ON c.parent_glossary_id = subtree.glossary_id
        )
        SELECT glossary_id FROM subtree
      )`
    : sql``;
  return sql<Record<string, unknown>[]>`
    SELECT
      bg.glossary_id AS "_ID", 'BUSINESS_TERMS' AS "_TYPE",
      bg.term_name_text AS "termName", parent.term_name_text AS "domainName", bg.definition_text AS definition,
      bg.classification_code AS classification, coalesce(bg.is_pii_indicator, false) AS "isPii", bg.pi_category_code AS "piCategory",
      bg.format_text AS format, bg.business_rules_text AS "businessRules", bg.example_text AS example
    FROM bayanat.business_glossaries bg
    LEFT JOIN bayanat.business_glossaries parent ON parent.glossary_id = bg.parent_glossary_id
    WHERE bg.parent_glossary_id IS NOT NULL ${whereDomain}
    ORDER BY parent.term_name_text, bg.term_name_text
  `;
}

async function fetchCustomAssetRows(typeId: number): Promise<Record<string, unknown>[]> {
  return sql<Record<string, unknown>[]>`
    SELECT
      ca.custom_asset_id AS "_ID", 'CUSTOM_ASSETS' AS "_TYPE",
      t.type_code AS "typeCode", ca.asset_name_text AS "assetName", ca.description_text AS description,
      COALESCE(ca.attributes_json, '{}'::jsonb)::text AS "attributesJson"
    FROM bayanat.custom_assets ca
    JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
    WHERE ca.type_id = ${typeId}
    ORDER BY ca.asset_name_text
  `;
}

async function fetchCustomAssetLinkRows(relTypeId: number): Promise<Record<string, unknown>[]> {
  const rows = await sql<{
    _ID: number; _TYPE: string; fromType: string; fromId: number; toType: string; toId: number;
    attributesJson: string; validFromDate: string | null; validToDate: string | null;
  }[]>`
    SELECT
      l.link_id AS "_ID", 'CUSTOM_ASSET_LINKS' AS "_TYPE",
      l.from_asset_type_code AS "fromType", l.from_asset_id AS "fromId",
      l.to_asset_type_code AS "toType", l.to_asset_id AS "toId",
      COALESCE(l.attributes_json, '{}'::jsonb)::text AS "attributesJson",
      l.valid_from_date::text AS "validFromDate", l.valid_to_date::text AS "validToDate"
    FROM bayanat.custom_asset_links l
    WHERE l.rel_type_id = ${relTypeId}
    ORDER BY l.link_id
  `;
  if (rows.length === 0) return [];

  const { resolveAssetNames, getRelationshipTypes } = await import("../queries/custom-assets");
  const relTypes = await getRelationshipTypes(true);
  const relCode = relTypes.find((r) => r.relTypeId === relTypeId)?.relCode ?? "";
  const refs = rows.flatMap((r) => [{ typeCode: r.fromType, id: r.fromId }, { typeCode: r.toType, id: r.toId }]);
  const names = await resolveAssetNames(refs);

  return rows.map((r) => ({
    _ID: r._ID, _TYPE: r._TYPE, relCode,
    fromType: r.fromType, fromName: names.get(`${r.fromType}:${r.fromId}`)?.name ?? `#${r.fromId}`,
    toType: r.toType, toName: names.get(`${r.toType}:${r.toId}`)?.name ?? `#${r.toId}`,
    attributesJson: r.attributesJson, validFromDate: r.validFromDate ?? "", validToDate: r.validToDate ?? "",
  }));
}

async function resolveEntityIdsForSource(dataSourceId: number): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`
    SELECT e.entity_id AS id FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${dataSourceId}
  `;
  return rows.map((r) => r.id);
}

async function resolveAttributeIdsForEntities(entityIds: number[]): Promise<number[]> {
  if (entityIds.length === 0) return [];
  const rows = await sql<{ id: number }[]>`SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ANY(${entityIds})`;
  return rows.map((r) => r.id);
}

export async function resolveDownloadScope(scope: DownloadScope): Promise<SheetRows> {
  const result: SheetRows = {};

  if (scope.type === "DATA_SOURCE") {
    result.DataSources = await fetchDataSourceRows([scope.dataSourceId]);
    if (scope.includeTables || scope.includeColumns) {
      const entityIds = await resolveEntityIdsForSource(scope.dataSourceId);
      result.Tables = await fetchTableRows(entityIds);
      if (scope.includeColumns) {
        const attrIds = await resolveAttributeIdsForEntities(entityIds);
        result.Columns = await fetchColumnRows(attrIds);
      }
    }
  } else if (scope.type === "SELECTED") {
    if (scope.entityIds?.length) result.Tables = await fetchTableRows(scope.entityIds);
    if (scope.attributeIds?.length) result.Columns = await fetchColumnRows(scope.attributeIds);
  } else if (scope.type === "SEARCH_RESULTS") {
    const entityIds = scope.refs.filter((r) => r.assetType === "DATA_ENTITIES").map((r) => r.assetId);
    const attrIds = scope.refs.filter((r) => r.assetType === "DATA_ATTRIBUTES").map((r) => r.assetId);
    const sourceIds = scope.refs.filter((r) => r.assetType === "DATA_SOURCES").map((r) => r.assetId);
    const termIds = scope.refs.filter((r) => r.assetType === "BUSINESS_TERMS").map((r) => r.assetId);
    if (sourceIds.length) result.DataSources = await fetchDataSourceRows(sourceIds);
    if (entityIds.length) result.Tables = await fetchTableRows(entityIds);
    if (attrIds.length) result.Columns = await fetchColumnRows(attrIds);
    if (termIds.length) {
      const all = await fetchBusinessTermRows(null);
      result.BusinessTerms = all.filter((r) => termIds.includes(r._ID as number));
    }
  } else if (scope.type === "BUSINESS_TERMS_ALL") {
    result.BusinessTerms = await fetchBusinessTermRows(null);
  } else if (scope.type === "BUSINESS_TERMS_DOMAIN") {
    result.BusinessTerms = await fetchBusinessTermRows(scope.domainId);
  } else if (scope.type === "CUSTOM_ASSETS_BY_TYPE") {
    result.CustomAssets = await fetchCustomAssetRows(scope.typeId);
  } else if (scope.type === "CUSTOM_ASSET_LINKS_BY_REL_TYPE") {
    result.CustomAssetLinks = await fetchCustomAssetLinkRows(scope.relTypeId);
  }

  return result;
}
