// Unified Search — backend (spec §4, "live federated queries" architecture:
// one query per asset type, run in parallel, merged in JS — see session decision
// log for why this replaces the spec's materialized search_index + CDC triggers).
//
// Each per-type query returns a capped, ranked slice PLUS a true total count via
// `count(*) OVER()` (same pattern already used by listDsas/listOpenDatasets) so
// facet counts are correct even though results are capped for the cross-type merge.

import { sql } from "../db";
import { parseQuery } from "./query-parser";
import type { FullSearchHit, SearchHitType, CommonFacets, SearchResponse } from "../search-types";
import { ALL_TYPES } from "../search-types";
import { getCustomAssetTypes } from "../queries/custom-assets";

export type SearchParams = {
  q: string;
  types: SearchHitType[];   // empty = all types
  page: number;
  limit: number;
  facets: CommonFacets;
};

type TypeResult = { hits: FullSearchHit[]; total: number };

const PER_TYPE_CAP = 300;
// Fuzzy (pg_trgm) fallback only covers the types users free-text-search most —
// scoping decision, not every type needs a fuzzy path for FR-3.3 to be satisfied.
const FUZZY_ELIGIBLE: SearchHitType[] = ["TABLE", "VIEW", "COLUMN", "TERM", "TAG", "CUSTOM_ASSET"];

function emptyResult(): TypeResult {
  return { hits: [], total: 0 };
}

// ── TABLE / VIEW (independent queries so per-type facet counts are exact) ──────
async function searchEntities(isView: boolean, freeText: string, opNameOnly: string | undefined, f: CommonFacets, fuzzy: boolean): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    entityId: number; name: string; desc: string | null; isView: boolean; rowCount: number | null;
    schemaId: number; schemaName: string; sourceName: string; updatedAt: string | null;
    rankTier: number; total: number;
  }[]>`
    SELECT
      e.entity_id AS "entityId", e.entity_name_text AS name, e.description_text AS desc,
      e.is_view_indicator AS "isView", e.row_count_estimate AS "rowCount",
      s.schema_id AS "schemaId", s.schema_name_text AS "schemaName", ds.source_name_text AS "sourceName",
      NULL::text AS "updatedAt",
      CASE
        WHEN ${like}::text IS NULL THEN 3
        WHEN lower(e.entity_name_text) = lower(${freeText}) THEN 0
        WHEN lower(e.entity_name_text) LIKE lower(${prefixLike}) THEN 1
        ELSE 3
      END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE COALESCE(e.is_view_indicator, false) = ${isView}
      ${like ? sql`AND (e.entity_name_text ILIKE ${like} OR e.display_name_text ILIKE ${like} OR e.description_text ILIKE ${like}
        ${fuzzy ? sql`OR similarity(e.entity_name_text, ${freeText}) > 0.2` : sql``})` : sql``}
      ${nameLike ? sql`AND e.entity_name_text ILIKE ${nameLike}` : sql``}
      ${f.dataSourceId ? sql`AND ds.data_source_id = ${f.dataSourceId}` : sql``}
      ${f.tagIds && f.tagIds.length > 0 ? sql`AND e.entity_id IN (SELECT asset_id FROM bayanat.asset_tags WHERE asset_type_code = 'DATA_ENTITIES' AND tag_id = ANY(${f.tagIds}))` : sql``}
      ${f.ownerUserId ? sql`AND e.entity_id IN (SELECT asset_id FROM bayanat.asset_stakeholders WHERE asset_type_code = 'DATA_ENTITIES' AND user_id = ${f.ownerUserId})` : sql``}
    ORDER BY "rankTier", e.entity_name_text
    LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();

  const entityIds = rows.map((r) => r.entityId);
  const [tagRows, stewardRows] = await Promise.all([
    sql<{ assetId: number; tagId: number; tagName: string; colorHex: string | null }[]>`
      SELECT at2.asset_id AS "assetId", t.tag_id AS "tagId", t.tag_name AS "tagName", t.color_hex AS "colorHex"
      FROM bayanat.asset_tags at2 JOIN bayanat.tags t ON t.tag_id = at2.tag_id
      WHERE at2.asset_type_code = 'DATA_ENTITIES' AND at2.asset_id = ANY(${entityIds})
    `,
    sql<{ assetId: number; userId: string; fullName: string; roleCode: string }[]>`
      SELECT ast.asset_id AS "assetId", ast.user_id AS "userId", u.full_name AS "fullName", ast.role_code AS "roleCode"
      FROM bayanat.asset_stakeholders ast JOIN bayanat.users u ON u.user_id = ast.user_id
      WHERE ast.asset_type_code = 'DATA_ENTITIES' AND ast.asset_id = ANY(${entityIds})
    `,
  ]);
  const tagsByEntity = new Map<number, { tagId: number; tagName: string; colorHex: string | null }[]>();
  for (const t of tagRows) tagsByEntity.set(t.assetId, [...(tagsByEntity.get(t.assetId) ?? []), { tagId: t.tagId, tagName: t.tagName, colorHex: t.colorHex }]);
  const stewardsByEntity = new Map<number, { userId: string; fullName: string; roleCode: string }[]>();
  for (const s of stewardRows) stewardsByEntity.set(s.assetId, [...(stewardsByEntity.get(s.assetId) ?? []), { userId: s.userId, fullName: s.fullName, roleCode: s.roleCode }]);

  const hits: FullSearchHit[] = rows.map((e) => ({
    type: e.isView ? "VIEW" : "TABLE", id: e.entityId, name: e.name, description: e.desc,
    href: `/catalog/${e.schemaId}/tables/${e.entityId}`, path: [e.sourceName, e.schemaName],
    rankTier: e.rankTier, updatedAt: e.updatedAt,
    rowCount: e.rowCount != null ? Number(e.rowCount) : null,
    schemaName: e.schemaName, sourceName: e.sourceName, isView: e.isView,
    tags: tagsByEntity.get(e.entityId) ?? [], stewards: stewardsByEntity.get(e.entityId) ?? [],
  }));
  return { hits, total: rows[0].total };
}

// ── COLUMN ────────────────────────────────────────────────────────────────────
async function searchColumns(freeText: string, opNameOnly: string | undefined, f: CommonFacets, fuzzy: boolean): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    attrId: number; name: string; desc: string | null; dataType: string | null;
    entityId: number; entityName: string; schemaId: number; schemaName: string; sourceName: string;
    classification: string | null; rankTier: number; total: number;
  }[]>`
    SELECT
      a.attribute_id AS "attrId", a.physical_name_text AS name, a.description_text AS desc, a.data_type_text AS "dataType",
      e.entity_id AS "entityId", e.entity_name_text AS "entityName",
      s.schema_id AS "schemaId", s.schema_name_text AS "schemaName", ds.source_name_text AS "sourceName",
      a.classification_code AS classification,
      CASE
        WHEN ${like}::text IS NULL THEN 3
        WHEN lower(a.physical_name_text) = lower(${freeText}) OR lower(a.friendly_name_text) = lower(${freeText}) THEN 0
        WHEN lower(a.physical_name_text) LIKE lower(${prefixLike}) THEN 1
        ELSE 3
      END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE true
      ${like ? sql`AND (a.physical_name_text ILIKE ${like} OR a.friendly_name_text ILIKE ${like} OR a.description_text ILIKE ${like}
        ${fuzzy ? sql`OR similarity(a.physical_name_text, ${freeText}) > 0.2` : sql``})` : sql``}
      ${nameLike ? sql`AND a.physical_name_text ILIKE ${nameLike}` : sql``}
      ${f.classification ? sql`AND a.classification_code = ${f.classification}` : sql``}
      ${f.dataSourceId ? sql`AND ds.data_source_id = ${f.dataSourceId}` : sql``}
      ${f.tagIds && f.tagIds.length > 0 ? sql`AND e.entity_id IN (SELECT asset_id FROM bayanat.asset_tags WHERE asset_type_code = 'DATA_ENTITIES' AND tag_id = ANY(${f.tagIds}))` : sql``}
      ${f.ownerUserId ? sql`AND e.entity_id IN (SELECT asset_id FROM bayanat.asset_stakeholders WHERE asset_type_code = 'DATA_ENTITIES' AND user_id = ${f.ownerUserId})` : sql``}
    ORDER BY "rankTier", a.physical_name_text
    LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();

  const hits: FullSearchHit[] = rows.map((c) => ({
    type: "COLUMN", id: c.attrId, name: c.name, description: c.desc,
    href: `/catalog/${c.schemaId}/tables/${c.entityId}`, path: [c.sourceName, c.schemaName, c.entityName],
    rankTier: c.rankTier, updatedAt: null,
    dataType: c.dataType, tableName: c.entityName, schemaName: c.schemaName, sourceName: c.sourceName,
    classification: c.classification ?? undefined, tags: [], stewards: [],
  }));
  return { hits, total: rows[0].total };
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────
async function searchSchemas(freeText: string, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const rows = await sql<{ schemaId: number; name: string; desc: string | null; sourceName: string; rankTier: number; total: number }[]>`
    SELECT s.schema_id AS "schemaId", s.schema_name_text AS name, s.description_text AS desc, ds.source_name_text AS "sourceName",
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(s.schema_name_text) = lower(${freeText}) THEN 0
           WHEN lower(s.schema_name_text) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.data_schemas s
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE true
      ${like ? sql`AND (s.schema_name_text ILIKE ${like} OR s.description_text ILIKE ${like})` : sql``}
      ${f.dataSourceId ? sql`AND ds.data_source_id = ${f.dataSourceId}` : sql``}
    ORDER BY "rankTier", s.schema_name_text LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((s) => ({
      type: "SCHEMA", id: s.schemaId, name: s.name, description: s.desc,
      href: `/catalog/${s.schemaId}`, path: [s.sourceName], rankTier: s.rankTier, updatedAt: null,
      sourceName: s.sourceName, tags: [], stewards: [],
    })),
  };
}

// ── SOURCE ────────────────────────────────────────────────────────────────────
async function searchSources(freeText: string, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const rows = await sql<{ sourceId: number; name: string; desc: string | null; rankTier: number; total: number }[]>`
    SELECT data_source_id AS "sourceId", source_name_text AS name, description_text AS desc,
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(source_name_text) = lower(${freeText}) THEN 0
           WHEN lower(source_name_text) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.data_sources
    WHERE true
      ${like ? sql`AND (source_name_text ILIKE ${like} OR description_text ILIKE ${like})` : sql``}
      ${f.dataSourceId ? sql`AND data_source_id = ${f.dataSourceId}` : sql``}
    ORDER BY "rankTier", source_name_text LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((s) => ({
      type: "SOURCE", id: s.sourceId, name: s.name, description: s.desc,
      href: `/catalog`, path: [], rankTier: s.rankTier, updatedAt: null, tags: [], stewards: [],
    })),
  };
}

// ── TERM (business glossary, incl. aliases) ────────────────────────────────────
async function searchTerms(freeText: string, opNameOnly: string | undefined, f: CommonFacets, fuzzy: boolean): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    termId: number; name: string; desc: string | null; classification: string | null;
    ownerUserId: string | null; updatedAt: string | null; rankTier: number; total: number;
  }[]>`
    SELECT g.glossary_id AS "termId", g.term_name_text AS name, g.definition_text AS desc,
      g.classification_code AS classification, g.owner_user_id AS "ownerUserId",
      g.created_at_timestamp::text AS "updatedAt",
      CASE
        WHEN ${like}::text IS NULL THEN 3
        WHEN lower(g.term_name_text) = lower(${freeText}) THEN 0
        WHEN lower(g.term_name_text) LIKE lower(${prefixLike}) THEN 1
        WHEN EXISTS (SELECT 1 FROM bayanat.glossary_aliases al WHERE al.glossary_id = g.glossary_id AND al.alias_name_text ILIKE ${like}) THEN 2
        ELSE 3
      END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.business_glossaries g
    WHERE true
      ${like ? sql`AND (g.term_name_text ILIKE ${like} OR g.definition_text ILIKE ${like}
        OR EXISTS (SELECT 1 FROM bayanat.glossary_aliases al WHERE al.glossary_id = g.glossary_id AND al.alias_name_text ILIKE ${like})
        ${fuzzy ? sql`OR similarity(g.term_name_text, ${freeText}) > 0.2` : sql``})` : sql``}
      ${nameLike ? sql`AND g.term_name_text ILIKE ${nameLike}` : sql``}
      ${f.classification ? sql`AND g.classification_code = ${f.classification}` : sql``}
      ${f.ownerUserId ? sql`AND g.owner_user_id = ${f.ownerUserId}` : sql``}
      ${f.sinceDate ? sql`AND g.created_at_timestamp >= ${f.sinceDate}::date` : sql``}
    ORDER BY "rankTier", g.term_name_text LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((t) => ({
      type: "TERM", id: t.termId, name: t.name, description: t.desc,
      href: `/glossary/${t.termId}`, path: [], rankTier: t.rankTier, updatedAt: t.updatedAt,
      classification: t.classification ?? undefined, tags: [], stewards: [],
    })),
  };
}

// ── TAG ───────────────────────────────────────────────────────────────────────
async function searchTags(freeText: string, fuzzy: boolean): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const rows = await sql<{ tagId: number; name: string; desc: string | null; usageCount: number; rankTier: number; total: number }[]>`
    SELECT t.tag_id AS "tagId", t.tag_name AS name, t.description AS desc,
      (SELECT count(*)::int FROM bayanat.asset_tags at2 WHERE at2.tag_id = t.tag_id) AS "usageCount",
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(t.tag_name) = lower(${freeText}) THEN 0
           WHEN lower(t.tag_name) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.tags t
    WHERE true
      ${like ? sql`AND (t.tag_name ILIKE ${like} OR t.description ILIKE ${like}
        ${fuzzy ? sql`OR similarity(t.tag_name, ${freeText}) > 0.2` : sql``})` : sql``}
    ORDER BY "rankTier", t.tag_name LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((t) => ({
      type: "TAG", id: t.tagId, name: t.name, description: t.desc,
      href: `/catalog`, path: [], rankTier: t.rankTier, updatedAt: null, tags: [], stewards: [],
      meta: { usageCount: t.usageCount },
    })),
  };
}

// ── DQ_RULE ───────────────────────────────────────────────────────────────────
async function searchDqRules(freeText: string, opNameOnly: string | undefined, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    ruleId: number; name: string; desc: string; dimension: string | null; severity: string | null;
    isActive: boolean; lastStatus: string | null; targetEntityId: number | null; targetSchemaId: number | null;
    targetName: string | null; updatedAt: string | null; rankTier: number; total: number;
  }[]>`
    SELECT r.rule_id AS "ruleId", r.rule_name_text AS name, r.rule_definition_text AS desc,
      r.dimension_code AS dimension, r.severity_level_code AS severity,
      r.is_active_indicator AS "isActive", r.last_status_code AS "lastStatus",
      r.created_at_timestamp::text AS "updatedAt",
      COALESCE(e1.entity_id, e2.entity_id) AS "targetEntityId",
      COALESCE(s1.schema_id, s2.schema_id) AS "targetSchemaId",
      COALESCE(e1.entity_name_text, a2.physical_name_text) AS "targetName",
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(r.rule_name_text) = lower(${freeText}) THEN 0
           WHEN lower(r.rule_name_text) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.dq_rules r
    LEFT JOIN bayanat.data_entities e1 ON r.asset_type_code = 'DATA_ENTITIES' AND e1.entity_id = r.asset_id
    LEFT JOIN bayanat.data_schemas s1 ON s1.schema_id = e1.schema_id
    LEFT JOIN bayanat.data_attributes a2 ON r.asset_type_code = 'DATA_ATTRIBUTES' AND a2.attribute_id = r.asset_id
    LEFT JOIN bayanat.data_entities e2 ON e2.entity_id = a2.entity_id
    LEFT JOIN bayanat.data_schemas s2 ON s2.schema_id = e2.schema_id
    WHERE true
      ${like ? sql`AND (r.rule_name_text ILIKE ${like} OR r.rule_definition_text ILIKE ${like})` : sql``}
      ${nameLike ? sql`AND r.rule_name_text ILIKE ${nameLike}` : sql``}
      ${f.dqDimension ? sql`AND r.dimension_code = ${f.dqDimension}` : sql``}
      ${f.status === "active" ? sql`AND r.is_active_indicator = true` : f.status === "inactive" ? sql`AND r.is_active_indicator = false` : sql``}
      ${f.sinceDate ? sql`AND r.created_at_timestamp >= ${f.sinceDate}::date` : sql``}
    ORDER BY "rankTier", r.rule_name_text LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((r) => ({
      type: "DQ_RULE", id: r.ruleId, name: r.name, description: r.desc,
      href: r.targetSchemaId != null ? `/catalog/${r.targetSchemaId}/tables/${r.targetEntityId}?tab=quality` : `/quality`,
      path: r.targetName ? [r.targetName] : [], rankTier: r.rankTier, updatedAt: r.updatedAt,
      tags: [], stewards: [],
      meta: { dimension: r.dimension, severity: r.severity, isActive: r.isActive, lastResultStatus: r.lastStatus },
    })),
  };
}

// ── SHARING_AGREEMENT ─────────────────────────────────────────────────────────
async function searchDsas(freeText: string, opNameOnly: string | undefined, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    dsaId: number; title: string; desc: string | null; scope: string; status: string;
    classification: string | null; expiryDate: string | null; createdBy: string | null;
    updatedAt: string | null; rankTier: number; total: number;
  }[]>`
    SELECT d.dsa_id AS "dsaId", d.title_text AS title, d.purpose_text AS desc,
      d.sharing_scope_code AS scope, d.status_code AS status, d.max_classification_code AS classification,
      d.effective_end_date::text AS "expiryDate", d.created_by AS "createdBy", d.updated_at::text AS "updatedAt",
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(d.title_text) = lower(${freeText}) THEN 0
           WHEN lower(d.title_text) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.data_sharing_agreements d
    WHERE true
      ${like ? sql`AND (d.title_text ILIKE ${like} OR d.counterparty_name_text ILIKE ${like} OR d.purpose_text ILIKE ${like} OR d.dsa_reference_code ILIKE ${like})` : sql``}
      ${nameLike ? sql`AND d.title_text ILIKE ${nameLike}` : sql``}
      ${f.classification ? sql`AND d.max_classification_code = ${f.classification}` : sql``}
      ${f.status ? sql`AND d.status_code = ${f.status}` : sql``}
      ${f.dsaScope ? sql`AND d.sharing_scope_code = ${f.dsaScope}` : sql``}
      ${f.ownerUserId ? sql`AND d.created_by = ${f.ownerUserId}` : sql``}
      ${f.sinceDate ? sql`AND d.updated_at >= ${f.sinceDate}::date` : sql``}
    ORDER BY "rankTier", d.title_text LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((d) => ({
      type: "SHARING_AGREEMENT", id: d.dsaId, name: d.title, description: d.desc,
      href: `/sharing/${d.dsaId}`, path: [], rankTier: d.rankTier, updatedAt: d.updatedAt,
      classification: d.classification ?? undefined, tags: [], stewards: [],
      meta: { scope: d.scope, status: d.status, expiryDate: d.expiryDate },
    })),
  };
}

// ── OPEN_DATA ─────────────────────────────────────────────────────────────────
async function searchOpenData(freeText: string, opNameOnly: string | undefined, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    datasetId: number; name: string; desc: string | null; status: string; domainCode: string | null;
    updatedAt: string | null; rankTier: number; total: number;
  }[]>`
    SELECT o.dataset_id AS "datasetId", o.dataset_name_text AS name, o.description_text AS desc,
      o.status_code AS status, o.domain_code AS "domainCode", o.updated_at::text AS "updatedAt",
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(o.dataset_name_text) = lower(${freeText}) THEN 0
           WHEN lower(o.dataset_name_text) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.open_datasets o
    WHERE o.deleted_at IS NULL
      ${like ? sql`AND (o.dataset_name_text ILIKE ${like} OR o.description_text ILIKE ${like})` : sql``}
      ${nameLike ? sql`AND o.dataset_name_text ILIKE ${nameLike}` : sql``}
      ${f.status ? sql`AND o.status_code = ${f.status}` : sql``}
      ${f.domainCode ? sql`AND o.domain_code = ${f.domainCode}` : sql``}
      ${f.ownerUserId ? sql`AND o.raised_by_user_id = ${f.ownerUserId}` : sql``}
      ${f.sinceDate ? sql`AND o.updated_at >= ${f.sinceDate}::date` : sql``}
    ORDER BY "rankTier", o.dataset_name_text LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((o) => ({
      type: "OPEN_DATA", id: o.datasetId, name: o.name, description: o.desc,
      href: `/open-data/${o.datasetId}`, path: [], rankTier: o.rankTier, updatedAt: o.updatedAt, tags: [], stewards: [],
      meta: { status: o.status },
    })),
  };
}

// ── FOI_REQUEST ───────────────────────────────────────────────────────────────
// Spec §5: requester PII never indexed — title/description built from
// reference_code + subject_text only, requester name/contact never selected.
async function searchFoi(freeText: string, opNameOnly: string | undefined, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    foiId: number; reference: string; subject: string; desc: string; status: string;
    dueDate: string | null; officerName: string | null; updatedAt: string | null; rankTier: number; total: number;
  }[]>`
    SELECT f.foi_request_id AS "foiId", f.reference_code AS reference, f.subject_text AS subject,
      f.description_text AS desc, f.status_code AS status, f.first_response_due_date::text AS "dueDate",
      u.full_name AS "officerName", f.updated_at::text AS "updatedAt",
      CASE WHEN ${like}::text IS NULL THEN 3 WHEN lower(f.subject_text) = lower(${freeText}) THEN 0
           WHEN lower(f.subject_text) LIKE lower(${prefixLike}) THEN 1 ELSE 3 END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.foi_requests f
    LEFT JOIN bayanat.users u ON u.user_id = f.assigned_officer_user_id
    WHERE true
      ${like ? sql`AND (f.subject_text ILIKE ${like} OR f.description_text ILIKE ${like} OR f.reference_code ILIKE ${like})` : sql``}
      ${nameLike ? sql`AND f.subject_text ILIKE ${nameLike}` : sql``}
      ${f.status ? sql`AND f.status_code = ${f.status}` : sql``}
      ${f.sinceDate ? sql`AND f.updated_at >= ${f.sinceDate}::date` : sql``}
    ORDER BY "rankTier", f.submitted_at DESC LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((r) => ({
      type: "FOI_REQUEST", id: r.foiId, name: `${r.reference} — ${r.subject}`, description: r.desc,
      href: `/foi/${r.foiId}`, path: [], rankTier: r.rankTier, updatedAt: r.updatedAt, tags: [], stewards: [],
      meta: { status: r.status, dueDate: r.dueDate, officerName: r.officerName },
    })),
  };
}

// ── REGISTER_ENTRY (governance registers — POLICY/PROCESS and other custom registers) ──
async function searchRegisterEntries(freeText: string, f: CommonFacets): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  if (!like) return emptyResult(); // dynamic JSONB data has no meaningful "browse all" ordering
  const rows = await sql<{
    entryId: number; registerId: number; registerName: string; data: Record<string, unknown>; updatedAt: string | null; total: number;
  }[]>`
    SELECT e.entry_id AS "entryId", e.register_id AS "registerId", r.name AS "registerName", e.data,
      e.updated_at::text AS "updatedAt",
      count(*) OVER()::int AS total
    FROM bayanat.gov_register_entries e
    JOIN bayanat.gov_registers r ON r.register_id = e.register_id
    WHERE r.deleted_at IS NULL AND e.data::text ILIKE ${like}
      ${f.sinceDate ? sql`AND e.updated_at >= ${f.sinceDate}::date` : sql``}
    ORDER BY e.updated_at DESC LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();
  return {
    total: rows[0].total,
    hits: rows.map((e) => {
      const data = e.data ?? {};
      const name = String(data["name"] ?? data["title"] ?? `Entry #${e.entryId}`);
      const summary = Object.entries(data).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 200);
      return {
        type: "REGISTER_ENTRY", id: e.entryId, name, description: summary || null,
        href: `/governance/registers/${e.registerId}`, path: [e.registerName], rankTier: 3, updatedAt: e.updatedAt,
        tags: [], stewards: [], meta: { registerName: e.registerName },
      };
    }),
  };
}

// ── CUSTOM_ASSET ──────────────────────────────────────────────────────────────
// Unlike REGISTER_ENTRY (queryable text only lives inside a JSONB blob), custom
// assets have real asset_name_text/description_text columns, so this gets honest
// rank tiers and a "browse all" default order — richer than the REGISTER_ENTRY
// precedent it's otherwise modeled on. attributes_json is only a same-tier text
// fallback for attribute-value hits, not the primary match surface.
async function searchCustomAssets(freeText: string, opNameOnly: string | undefined, f: CommonFacets, fuzzy: boolean): Promise<TypeResult> {
  const like = freeText ? `%${freeText}%` : null;
  const prefixLike = freeText ? `${freeText}%` : null;
  const nameLike = opNameOnly ? `%${opNameOnly}%` : null;

  const rows = await sql<{
    customAssetId: number; name: string; desc: string | null; typeCode: string; typeName: string;
    updatedAt: string | null; rankTier: number; total: number;
  }[]>`
    SELECT
      ca.custom_asset_id AS "customAssetId", ca.asset_name_text AS name, ca.description_text AS desc,
      t.type_code AS "typeCode", t.type_name_text AS "typeName", ca.updated_at::text AS "updatedAt",
      CASE
        WHEN ${like}::text IS NULL THEN 3
        WHEN lower(ca.asset_name_text) = lower(${freeText}) THEN 0
        WHEN lower(ca.asset_name_text) LIKE lower(${prefixLike}) THEN 1
        WHEN ca.attributes_json::text ILIKE ${like} THEN 2
        ELSE 3
      END AS "rankTier",
      count(*) OVER()::int AS total
    FROM bayanat.custom_assets ca
    JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
    WHERE t.is_enabled_indicator = true
      ${like ? sql`AND (ca.asset_name_text ILIKE ${like} OR ca.description_text ILIKE ${like} OR ca.attributes_json::text ILIKE ${like}
        ${fuzzy ? sql`OR similarity(ca.asset_name_text, ${freeText}) > 0.2` : sql``})` : sql``}
      ${nameLike ? sql`AND ca.asset_name_text ILIKE ${nameLike}` : sql``}
      ${f.customTypeCode ? sql`AND t.type_code = ${f.customTypeCode}` : sql``}
      ${f.sinceDate ? sql`AND ca.updated_at >= ${f.sinceDate}::date` : sql``}
    ORDER BY "rankTier", ca.asset_name_text
    LIMIT ${PER_TYPE_CAP}
  `;
  if (rows.length === 0) return emptyResult();

  const typeCodesPresent = [...new Set(rows.map((r) => `CUSTOM:${r.typeCode}`))];
  const ids = rows.map((r) => r.customAssetId);
  const [tagRows, stewardRows] = await Promise.all([
    sql<{ assetTypeCode: string; assetId: number; tagId: number; tagName: string; colorHex: string | null }[]>`
      SELECT at2.asset_type_code AS "assetTypeCode", at2.asset_id AS "assetId", tg.tag_id AS "tagId", tg.tag_name AS "tagName", tg.color_hex AS "colorHex"
      FROM bayanat.asset_tags at2 JOIN bayanat.tags tg ON tg.tag_id = at2.tag_id
      WHERE at2.asset_type_code = ANY(${typeCodesPresent}) AND at2.asset_id = ANY(${ids})
    `,
    sql<{ assetTypeCode: string; assetId: number; userId: string; fullName: string; roleCode: string }[]>`
      SELECT ast.asset_type_code AS "assetTypeCode", ast.asset_id AS "assetId", ast.user_id AS "userId", u.full_name AS "fullName", ast.role_code AS "roleCode"
      FROM bayanat.asset_stakeholders ast JOIN bayanat.users u ON u.user_id = ast.user_id
      WHERE ast.asset_type_code = ANY(${typeCodesPresent}) AND ast.asset_id = ANY(${ids})
    `,
  ]);
  const tagsByAsset = new Map<string, { tagId: number; tagName: string; colorHex: string | null }[]>();
  for (const t of tagRows) {
    const key = `${t.assetTypeCode}:${t.assetId}`;
    tagsByAsset.set(key, [...(tagsByAsset.get(key) ?? []), { tagId: t.tagId, tagName: t.tagName, colorHex: t.colorHex }]);
  }
  const stewardsByAsset = new Map<string, { userId: string; fullName: string; roleCode: string }[]>();
  for (const s of stewardRows) {
    const key = `${s.assetTypeCode}:${s.assetId}`;
    stewardsByAsset.set(key, [...(stewardsByAsset.get(key) ?? []), { userId: s.userId, fullName: s.fullName, roleCode: s.roleCode }]);
  }

  return {
    total: rows[0].total,
    hits: rows.map((r) => {
      const key = `CUSTOM:${r.typeCode}:${r.customAssetId}`;
      return {
        type: "CUSTOM_ASSET", id: r.customAssetId, name: r.name, description: r.desc,
        href: `/assets/${r.typeCode.toLowerCase()}/${r.customAssetId}`, path: [r.typeName],
        rankTier: r.rankTier, updatedAt: r.updatedAt,
        tags: tagsByAsset.get(key) ?? [], stewards: stewardsByAsset.get(key) ?? [],
        meta: { customTypeCode: r.typeCode, customTypeName: r.typeName },
      };
    }),
  };
}

async function resolveTagOperator(tagName: string): Promise<number[]> {
  const rows = await sql<{ tagId: number }[]>`SELECT tag_id AS "tagId" FROM bayanat.tags WHERE tag_name ILIKE ${tagName}`;
  return rows.map((r) => r.tagId);
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function runOnce(q: string, types: SearchHitType[], facetsIn: CommonFacets, fuzzy: boolean): Promise<Map<SearchHitType, TypeResult>> {
  const parsed = parseQuery(q);
  const freeText = parsed.freeText;
  const opName = parsed.operators.name;

  // Field operators (classification:/owner:) override/augment the facet-panel
  // selection for the same field — an explicit query operator wins.
  const facets: CommonFacets = {
    ...facetsIn,
    classification: parsed.operators.classification ?? facetsIn.classification,
    ownerUserId: parsed.operators.owner ?? facetsIn.ownerUserId,
  };
  const tagOperatorIds = parsed.operators.tag ? await resolveTagOperator(parsed.operators.tag) : null;
  if (tagOperatorIds) facets.tagIds = [...new Set([...(facets.tagIds ?? []), ...tagOperatorIds])];

  // `type:<custom type code>` (e.g. "type:customer") isn't itself a SearchHitType —
  // custom type codes route through the single CUSTOM_ASSET type scoped by a
  // customTypeCode facet instead. Resolve any operator value that isn't a real
  // SearchHitType against enabled custom type codes before filtering effectiveTypes.
  let requestedTypes = parsed.operators.type ?? null;
  if (requestedTypes && requestedTypes.some((t) => !(ALL_TYPES as string[]).includes(t))) {
    const customTypes = await getCustomAssetTypes();
    const matchedCode = customTypes.find((ct) => requestedTypes!.includes(ct.typeCode))?.typeCode;
    if (matchedCode) {
      requestedTypes = [...requestedTypes.filter((t) => (ALL_TYPES as string[]).includes(t)), "CUSTOM_ASSET"];
      facets.customTypeCode = matchedCode;
    }
  }
  const effectiveTypes = requestedTypes && requestedTypes.length > 0
    ? types.filter((t) => requestedTypes!.includes(t))
    : types;
  const want = (t: SearchHitType) => effectiveTypes.includes(t);

  const [tbl, vw, col, sch, src, term, tag, dq, dsa, od, foi, reg, ca] = await Promise.all([
    want("TABLE") ? searchEntities(false, freeText, opName, facets, fuzzy && FUZZY_ELIGIBLE.includes("TABLE")) : Promise.resolve(emptyResult()),
    want("VIEW") ? searchEntities(true, freeText, opName, facets, fuzzy && FUZZY_ELIGIBLE.includes("TABLE")) : Promise.resolve(emptyResult()),
    want("COLUMN") ? searchColumns(freeText, opName, facets, fuzzy) : Promise.resolve(emptyResult()),
    want("SCHEMA") ? searchSchemas(freeText, facets) : Promise.resolve(emptyResult()),
    want("SOURCE") ? searchSources(freeText, facets) : Promise.resolve(emptyResult()),
    want("TERM") ? searchTerms(freeText, opName, facets, fuzzy) : Promise.resolve(emptyResult()),
    want("TAG") ? searchTags(freeText, fuzzy) : Promise.resolve(emptyResult()),
    want("DQ_RULE") ? searchDqRules(freeText, opName, facets) : Promise.resolve(emptyResult()),
    want("SHARING_AGREEMENT") ? searchDsas(freeText, opName, facets) : Promise.resolve(emptyResult()),
    want("OPEN_DATA") ? searchOpenData(freeText, opName, facets) : Promise.resolve(emptyResult()),
    want("FOI_REQUEST") ? searchFoi(freeText, opName, facets) : Promise.resolve(emptyResult()),
    want("REGISTER_ENTRY") ? searchRegisterEntries(freeText, facets) : Promise.resolve(emptyResult()),
    want("CUSTOM_ASSET") ? searchCustomAssets(freeText, opName, facets, fuzzy && FUZZY_ELIGIBLE.includes("CUSTOM_ASSET")) : Promise.resolve(emptyResult()),
  ]);

  const map = new Map<SearchHitType, TypeResult>();
  map.set("TABLE", tbl);
  map.set("VIEW", vw);
  map.set("COLUMN", col);
  map.set("SCHEMA", sch);
  map.set("SOURCE", src);
  map.set("TERM", term);
  map.set("TAG", tag);
  map.set("DQ_RULE", dq);
  map.set("SHARING_AGREEMENT", dsa);
  map.set("OPEN_DATA", od);
  map.set("FOI_REQUEST", foi);
  map.set("REGISTER_ENTRY", reg);
  map.set("CUSTOM_ASSET", ca);
  return map;
}

export async function runSearch(params: SearchParams): Promise<SearchResponse> {
  const types = params.types.length > 0 ? params.types : ALL_TYPES;
  if (!params.q.trim()) {
    return { counts: {}, total: 0, page: params.page, limit: params.limit, results: [] };
  }

  let map = await runOnce(params.q, types, params.facets, false);
  let allHits = [...map.values()].flatMap((r) => r.hits);

  // FR-3.3: trigram fuzzy fallback when the strict pass returns < 3 hits
  let usedFuzzy = false;
  if (allHits.length < 3) {
    const fuzzyMap = await runOnce(params.q, types, params.facets, true);
    const fuzzyHits = [...fuzzyMap.values()].flatMap((r) => r.hits);
    if (fuzzyHits.length > allHits.length) {
      map = fuzzyMap;
      allHits = fuzzyHits;
      usedFuzzy = true;
    }
  }

  const counts: Partial<Record<SearchHitType, number>> = {};
  let total = 0;
  for (const [type, r] of map) {
    if (r.total > 0) counts[type] = r.total;
    total += r.total;
  }

  allHits.sort((a, b) => a.rankTier - b.rankTier || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.name.localeCompare(b.name));
  const offset = (params.page - 1) * params.limit;
  const pageHits = allHits.slice(offset, offset + params.limit);

  let suggestions: string[] | undefined;
  if (allHits.length === 0) {
    const parsed = parseQuery(params.q);
    if (parsed.freeText) {
      suggestions = await closestGlossaryTerms(parsed.freeText);
    }
  }

  return { counts, total, page: params.page, limit: params.limit, results: pageHits, suggestions };
}

async function closestGlossaryTerms(freeText: string): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    SELECT term_name_text AS name FROM bayanat.business_glossaries
    WHERE similarity(term_name_text, ${freeText}) > 0.15
    ORDER BY similarity(term_name_text, ${freeText}) DESC LIMIT 5
  `;
  return rows.map((r) => r.name);
}
