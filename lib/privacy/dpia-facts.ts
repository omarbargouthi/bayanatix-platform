// What the catalog already knows about the assets a DPIA is about: the personal data
// in them, where it flows, who receives it, who can see it and how long it is kept.
// Read once per refresh and stored on the assessment, so an approved version keeps
// the facts it was approved on.
import { sql } from "../db";
import type { DpiaAsset, DpiaFacts, DpiaFlag } from "./dpia-types";

/** A table this large, holding personal data, counts as large-scale processing. */
export const LARGE_SCALE_ROWS = 100_000;
const SENSITIVE_PI_CATEGORIES = new Set(["HEALTH", "BIOMETRIC"]);
const PI_COLUMN_CLASSES = ["PII", "SENSITIVE"];
const MAX_LISTED = 200;

export type AssetRef = { typeCode: string; id: number };
const isCustom = (t: string) => t.startsWith("CUSTOM:");
const uniq = (a: number[]) => [...new Set(a)];

type Resolved = { sourceIds: number[]; entityIds: number[]; attributeIds: number[] };

/**
 * Turns the linked assets into tables and columns. A source or schema brings all its
 * tables. A custom asset brings what it is linked to; when it points at specific
 * tables or columns, a source it also names is context, not the whole source.
 */
export async function resolveScope(assets: AssetRef[]): Promise<Resolved> {
  const sources: number[] = [], schemas: number[] = [], entities: number[] = [], attributes: number[] = [];
  const take = (r: AssetRef, into: { sources: number[]; schemas: number[]; entities: number[]; attributes: number[] }) => {
    if (r.typeCode === "DATA_SOURCES") into.sources.push(r.id);
    else if (r.typeCode === "DATA_SCHEMAS") into.schemas.push(r.id);
    else if (r.typeCode === "DATA_ENTITIES") into.entities.push(r.id);
    else if (r.typeCode === "DATA_ATTRIBUTES") into.attributes.push(r.id);
  };
  for (const a of assets) {
    if (!isCustom(a.typeCode)) { take(a, { sources, schemas, entities, attributes }); continue; }
    const links = await sql<{ typeCode: string; id: number }[]>`
      SELECT to_asset_type_code AS "typeCode", to_asset_id AS id FROM bayanat.custom_asset_links
      WHERE from_asset_type_code = ${a.typeCode} AND from_asset_id = ${a.id}
        AND (valid_to_date IS NULL OR valid_to_date >= CURRENT_DATE)
      UNION
      SELECT from_asset_type_code, from_asset_id FROM bayanat.custom_asset_links
      WHERE to_asset_type_code = ${a.typeCode} AND to_asset_id = ${a.id}
        AND (valid_to_date IS NULL OR valid_to_date >= CURRENT_DATE)
    `;
    const own = { sources: [] as number[], schemas: [] as number[], entities: [] as number[], attributes: [] as number[] };
    for (const l of links) if (!isCustom(l.typeCode)) take(l, own);
    const specific = own.entities.length + own.attributes.length > 0;
    entities.push(...own.entities); attributes.push(...own.attributes);
    if (!specific) { sources.push(...own.sources); schemas.push(...own.schemas); }
  }

  const fromContainers = sources.length + schemas.length === 0 ? [] : await sql<{ entityId: number }[]>`
    SELECT e.entity_id AS "entityId" FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ANY(${sources}) OR s.schema_id = ANY(${schemas})
  `;
  const entityIds = uniq([...entities, ...fromContainers.map((r) => Number(r.entityId))]);
  // Columns named one by one, except those whose whole table is already in scope.
  const loose = attributes.length === 0 ? [] : await sql<{ attributeId: number }[]>`
    SELECT attribute_id AS "attributeId" FROM bayanat.data_attributes WHERE attribute_id = ANY(${uniq(attributes)}) AND NOT (entity_id = ANY(${entityIds}))
  `;
  return { sourceIds: uniq(sources), entityIds, attributeIds: loose.map((r) => Number(r.attributeId)) };
}

const IS_PI = sql`(
  a.classification_code = ANY(${PI_COLUMN_CLASSES})
  OR EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
             WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION' AND bg.is_pii_indicator)
)`;

export async function buildDpiaFacts(assets: AssetRef[], subject: AssetRef | null): Promise<DpiaFacts> {
  const { entityIds, attributeIds } = await resolveScope(assets);
  const flags: DpiaFlag[] = [];
  const flag = (code: DpiaFlag["code"], n = 0, detail: string | null = null) => flags.push({ code, n, detail });

  // ── The subject, when it is a custom asset: its own fields ──────────────────
  let subjectFacts: DpiaFacts["subject"] = null;
  let subjectCrossBorder = false;
  if (subject && isCustom(subject.typeCode)) {
    const [row] = await sql<{ name: string; description: string | null; attributes: Record<string, unknown>; typeId: number; typeName: string }[]>`
      SELECT ca.asset_name_text AS name, ca.description_text AS description, ca.attributes_json AS attributes, t.type_id AS "typeId", t.type_name_text AS "typeName"
      FROM bayanat.custom_assets ca JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
      WHERE ca.custom_asset_id = ${subject.id}
    `;
    if (row) {
      const defs = await sql<{ code: string; label: string }[]>`
        SELECT attr_code AS code, attr_name_text AS label FROM bayanat.custom_asset_type_attributes WHERE type_id = ${row.typeId} ORDER BY display_order_int
      `;
      const attributes = defs
        .map((d) => ({ code: d.code, label: d.label, raw: row.attributes?.[d.code] }))
        .filter((d) => d.raw != null && d.raw !== "")
        .map((d) => ({ code: d.code, label: d.label, value: typeof d.raw === "boolean" ? (d.raw ? "Yes" : "No") : String(d.raw) }));
      subjectCrossBorder = row.attributes?.CROSS_BORDER === true;
      subjectFacts = { typeCode: subject.typeCode, typeName: row.typeName, name: row.name, description: row.description, attributes };
    }
  }

  // ── Related custom assets: linked to a custom asset in scope, or to its systems ─
  const scopeSources = entityIds.length + attributeIds.length === 0 ? [] : await sql<{ id: number; name: string }[]>`
    SELECT DISTINCT ds.data_source_id AS id, ds.source_name_text AS name
    FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ANY(${entityIds}) OR e.entity_id IN (SELECT entity_id FROM bayanat.data_attributes WHERE attribute_id = ANY(${attributeIds}))
    ORDER BY ds.source_name_text
  `;
  const customInScope = assets.filter((a) => isCustom(a.typeCode));
  const related: DpiaFacts["related"] = [];
  {
    const anchors: AssetRef[] = [...customInScope, ...scopeSources.map((s) => ({ typeCode: "DATA_SOURCES", id: Number(s.id) })), ...assets.filter((a) => a.typeCode === "DATA_ENTITIES")];
    const seen = new Set(customInScope.map((a) => `${a.typeCode}:${a.id}`));
    for (const anchor of anchors) {
      const rows = await sql<{ relation: string; typeName: string; typeCode: string; id: number; name: string }[]>`
        SELECT CASE WHEN l.from_asset_type_code = ${anchor.typeCode} AND l.from_asset_id = ${anchor.id} THEN r.rel_name_text ELSE coalesce(r.inverse_name_text, r.rel_name_text) END AS relation,
               t.type_name_text AS "typeName", t.type_code AS "typeCode", ca.custom_asset_id AS id, ca.asset_name_text AS name
        FROM bayanat.custom_asset_links l
        JOIN bayanat.custom_relationship_types r ON r.rel_type_id = l.rel_type_id
        JOIN bayanat.custom_assets ca ON ca.custom_asset_id = CASE WHEN l.from_asset_type_code = ${anchor.typeCode} AND l.from_asset_id = ${anchor.id} THEN l.to_asset_id ELSE l.from_asset_id END
        JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
        WHERE ((l.from_asset_type_code = ${anchor.typeCode} AND l.from_asset_id = ${anchor.id} AND l.to_asset_type_code = 'CUSTOM:' || t.type_code)
            OR (l.to_asset_type_code = ${anchor.typeCode} AND l.to_asset_id = ${anchor.id} AND l.from_asset_type_code = 'CUSTOM:' || t.type_code))
          AND (l.valid_to_date IS NULL OR l.valid_to_date >= CURRENT_DATE)
      `;
      for (const r of rows) {
        const key = `CUSTOM:${r.typeCode}:${r.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        related.push({ relation: r.relation, typeName: r.typeName, name: r.name, href: `/assets/${r.typeCode.toLowerCase()}/${r.id}` });
      }
    }
  }

  // ── Scope and the personal data in it ───────────────────────────────────────
  const tables = entityIds.length + attributeIds.length === 0 ? [] : await sql<{ entityId: number; name: string; schema: string; source: string; rows: number | null; whole: boolean; columns: number; categoryId: number | null }[]>`
    SELECT e.entity_id AS "entityId", e.entity_name_text AS name, s.schema_name_text AS schema, ds.source_name_text AS source,
           e.row_count_estimate::float8 AS rows, (e.entity_id = ANY(${entityIds})) AS whole,
           (SELECT count(*)::int FROM bayanat.data_attributes x WHERE x.entity_id = e.entity_id AND (e.entity_id = ANY(${entityIds}) OR x.attribute_id = ANY(${attributeIds}))) AS columns,
           e.retention_category_id AS "categoryId"
    FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ANY(${entityIds}) OR e.entity_id IN (SELECT entity_id FROM bayanat.data_attributes WHERE attribute_id = ANY(${attributeIds}))
    ORDER BY ds.source_name_text, s.schema_name_text, e.entity_name_text
  `;
  const allEntityIds = tables.map((t) => Number(t.entityId));

  const pi = allEntityIds.length === 0 ? [] : await sql<{ attributeId: number; entityId: number; column: string; table: string; source: string; term: string | null; categoryCode: string | null; category: string | null; classification: string | null; encrypted: boolean }[]>`
    SELECT a.attribute_id AS "attributeId", e.entity_id AS "entityId", a.physical_name_text AS column, e.entity_name_text AS table, ds.source_name_text AS source,
           pt.term, pt."categoryCode", pt.category, a.classification_code AS classification, coalesce(a.is_encrypted, false) AS encrypted
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    LEFT JOIN LATERAL (
      SELECT bg.term_name_text AS term, bg.pi_category_code AS "categoryCode", pc.category_name_text AS category
      FROM bayanat.asset_business_terms abt JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id AND bg.is_pii_indicator
      LEFT JOIN bayanat.pi_category_types pc ON pc.category_code = bg.pi_category_code
      WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
      ORDER BY abt.abt_id LIMIT 1
    ) pt ON true
    WHERE (a.entity_id = ANY(${entityIds}) OR a.attribute_id = ANY(${attributeIds})) AND ${IS_PI}
    ORDER BY ds.source_name_text, e.entity_name_text, a.physical_name_text
  `;
  const piIds = pi.map((p) => Number(p.attributeId));
  const piByTable = new Map<number, number>();
  for (const p of pi) piByTable.set(Number(p.entityId), (piByTable.get(Number(p.entityId)) ?? 0) + 1);

  const categories = new Map<string, { code: string; name: string; count: number; sensitive: boolean }>();
  for (const p of pi) {
    const code = p.categoryCode ?? (p.classification === "SENSITIVE" ? "SENSITIVE" : "UNCATEGORISED");
    const c = categories.get(code) ?? { code, name: p.category ?? code, count: 0, sensitive: SENSITIVE_PI_CATEGORIES.has(code) || code === "SENSITIVE" };
    c.count++; categories.set(code, c);
  }
  const sensitiveCols = pi.filter((p) => (p.categoryCode && SENSITIVE_PI_CATEGORIES.has(p.categoryCode)) || p.classification === "SENSITIVE");
  const unencrypted = pi.filter((p) => !p.encrypted).length;
  const piTables = tables.filter((t) => piByTable.has(Number(t.entityId)));
  const rowsKnown = piTables.map((t) => t.rows).filter((r): r is number => r != null);
  const maxRows = rowsKnown.length ? Math.max(...rowsKnown) : null;

  if (assets.length === 0) flag("NO_SCOPE");
  else if (pi.length === 0) flag("NO_PI");
  if (sensitiveCols.length) flag("SENSITIVE_PI", sensitiveCols.length, [...new Set(sensitiveCols.map((p) => p.category ?? p.classification ?? ""))].filter(Boolean).join(", ") || null);
  if (maxRows != null && maxRows >= LARGE_SCALE_ROWS) flag("LARGE_SCALE", Math.round(maxRows), piTables.find((t) => t.rows === maxRows)?.name ?? null);
  if (unencrypted) flag("UNENCRYPTED_PI", unencrypted);

  // ── Where the personal data flows (column lineage, up to six steps) ─────────
  const downstream = piIds.length === 0 ? [] : await sql<{ source: string; schema: string; table: string; entityId: number; columns: number; unclassified: number; hops: number }[]>`
    WITH RECURSIVE down AS (
      SELECT dl.target_asset_id AS attr, 1 AS hops
      FROM bayanat.data_lineage dl WHERE dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND dl.source_asset_id = ANY(${piIds})
      UNION
      SELECT dl.target_asset_id, d.hops + 1
      FROM down d JOIN bayanat.data_lineage dl ON dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND dl.source_asset_id = d.attr
      WHERE d.hops < 6
    ), reached AS (SELECT attr, min(hops) AS hops FROM down GROUP BY attr)
    SELECT ds.source_name_text AS source, s.schema_name_text AS schema, e.entity_name_text AS table, e.entity_id AS "entityId",
           count(*)::int AS columns, count(*) FILTER (WHERE NOT ${IS_PI})::int AS unclassified, min(r.hops)::int AS hops
    FROM reached r
    JOIN bayanat.data_attributes a ON a.attribute_id = r.attr
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE NOT (e.entity_id = ANY(${allEntityIds}))
    GROUP BY ds.source_name_text, s.schema_name_text, e.entity_name_text, e.entity_id
    ORDER BY min(r.hops), ds.source_name_text, e.entity_name_text
  `;
  const scopeSourceNames = scopeSources.map((s) => s.name);
  const piSourceNames = [...new Set(pi.map((p) => p.source))];
  const otherSystems = [...new Set(downstream.map((d) => d.source))].filter((s) => !scopeSourceNames.includes(s));
  const unclassifiedCopies = downstream.reduce((n, d) => n + Number(d.unclassified), 0);
  if (unclassifiedCopies) flag("DOWNSTREAM_UNCLASSIFIED", unclassifiedCopies);
  if (piSourceNames.length > 1 || otherSystems.length > 0) flag("MULTI_SOURCE", new Set([...piSourceNames, ...otherSystems]).size, [...new Set([...piSourceNames, ...otherSystems])].join(", "));

  // ── Who receives it: sharing agreements that include a table in scope ───────
  const sharing = allEntityIds.length === 0 ? [] : await sql<DpiaFacts["sharing"]>`
    SELECT DISTINCT d.dsa_reference_code AS reference, d.title_text AS title, d.counterparty_name_text AS counterparty, d.sharing_scope_code AS scope,
           d.status_code AS status, d.legal_basis_text AS "legalBasis", d.purpose_text AS purpose, d.is_cross_border AS "crossBorder",
           d.contains_personal_data_indicator AS "personalData"
    FROM bayanat.data_sharing_agreements d JOIN bayanat.dsa_datasets x ON x.dsa_id = d.dsa_id
    WHERE x.entity_id = ANY(${allEntityIds}) AND d.status_code NOT IN ('TERMINATED', 'EXPIRED')
    ORDER BY d.title_text
  `;
  const external = sharing.filter((s) => s.scope !== "INTERNAL");
  if (external.length) flag("EXTERNAL_SHARING", external.length, external.map((s) => s.counterparty || s.title).join(", "));
  if (sharing.some((s) => s.crossBorder) || subjectCrossBorder) flag("CROSS_BORDER", sharing.filter((s) => s.crossBorder).length);

  // ── Who can see the personal data in clear ──────────────────────────────────
  const grants = allEntityIds.length === 0 ? [] : await sql<{ user: string; asset: string; purpose: string | null; legalBasis: string | null; userId: string }[]>`
    SELECT coalesce(u.full_name, g.user_id) AS user, e.entity_name_text AS asset, g.purpose_text AS purpose, g.legal_basis_text AS "legalBasis", g.user_id AS "userId"
    FROM bayanat.pi_access_grants g
    JOIN bayanat.data_entities e ON (g.asset_type_code = 'DATA_ENTITIES' AND e.entity_id = g.asset_id)
      OR (g.asset_type_code = 'DATA_ATTRIBUTES' AND e.entity_id = (SELECT entity_id FROM bayanat.data_attributes WHERE attribute_id = g.asset_id))
    LEFT JOIN bayanat.users u ON u.user_id = g.user_id
    WHERE e.entity_id = ANY(${allEntityIds})
    ORDER BY g.granted_at DESC
  `;

  // ── How long it is kept ─────────────────────────────────────────────────────
  const categoryIds = uniq(piTables.map((t) => t.categoryId).filter((c): c is number => c != null).map(Number));
  const retentionCats = categoryIds.length === 0 ? [] : await sql<{ categoryId: number; name: string; sensitivity: string | null; schedule: string | null }[]>`
    SELECT c.category_id AS "categoryId", c.name, c.sensitivity,
           (SELECT rs.retention_period || ' ' || lower(rs.retention_unit) || ' → ' || rs.post_retention_action || ' (' || rs.jurisdiction || ')'
            FROM bayanat.retention_schedules rs WHERE rs.category_id = c.category_id ORDER BY rs.is_default DESC, rs.schedule_id LIMIT 1) AS schedule
    FROM bayanat.data_categories c WHERE c.category_id = ANY(${categoryIds}) ORDER BY c.name
  `;
  const withoutCategory = piTables.filter((t) => t.categoryId == null).map((t) => t.name);
  if (withoutCategory.length) flag("NO_RETENTION", withoutCategory.length);
  const holds = allEntityIds.length === 0 ? [] : await sql<{ reference: string; name: string }[]>`
    SELECT DISTINCT h.case_reference AS reference, h.case_name AS name
    FROM bayanat.legal_holds h
    WHERE h.hold_status = 'ACTIVE' AND NOT coalesce(h.is_deleted, false)
      AND (EXISTS (SELECT 1 FROM bayanat.legal_hold_entities he WHERE he.hold_id = h.hold_id AND he.entity_id = ANY(${allEntityIds}))
        OR EXISTS (SELECT 1 FROM bayanat.legal_hold_categories hc WHERE hc.hold_id = h.hold_id AND hc.category_id = ANY(${categoryIds})))
  `;

  const owners = allEntityIds.length === 0 ? [] : await sql<{ name: string }[]>`
    SELECT DISTINCT coalesce(u.full_name, st.user_id) AS name
    FROM bayanat.asset_stakeholders st LEFT JOIN bayanat.users u ON u.user_id = st.user_id
    WHERE st.role_code = 'OWNER' AND ((st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = ANY(${allEntityIds}))
       OR (st.asset_type_code = 'DATA_SOURCES' AND st.asset_id = ANY(${scopeSources.map((s) => Number(s.id))})))
    ORDER BY 1
  `;

  return {
    generatedAt: new Date().toISOString(),
    subject: subjectFacts,
    related,
    scope: {
      sources: scopeSourceNames, tableCount: tables.length, columnCount: tables.reduce((n, t) => n + Number(t.columns), 0),
      rowEstimate: maxRows,
      tables: tables.slice(0, MAX_LISTED).map((t) => ({ entityId: Number(t.entityId), name: t.name, schema: t.schema, source: t.source, rows: t.rows, piColumns: piByTable.get(Number(t.entityId)) ?? 0 })),
    },
    personalData: {
      columnCount: pi.length, unencryptedCount: unencrypted,
      categories: [...categories.values()].sort((a, b) => b.count - a.count),
      columns: pi.slice(0, MAX_LISTED).map((p) => ({ column: p.column, table: p.table, source: p.source, term: p.term, category: p.category, classification: p.classification, encrypted: p.encrypted })),
    },
    flows: {
      systems: otherSystems,
      tables: downstream.slice(0, MAX_LISTED).map((d) => ({ source: d.source, schema: d.schema, table: d.table, columns: Number(d.columns), unclassified: Number(d.unclassified), hops: Number(d.hops) })),
    },
    sharing: [...sharing],
    access: {
      grantCount: grants.length, userCount: new Set(grants.map((g) => g.userId)).size,
      grants: grants.slice(0, 30).map((g) => ({ user: g.user, asset: g.asset, purpose: g.purpose, legalBasis: g.legalBasis })),
    },
    retention: {
      categories: retentionCats.map((c) => ({ name: c.name, sensitivity: c.sensitivity, schedule: c.schedule, tables: piTables.filter((t) => Number(t.categoryId) === Number(c.categoryId)).length })),
      tablesWithoutCategory: withoutCategory.slice(0, 50),
      holds: [...holds],
    },
    owners: owners.map((o) => o.name),
    flags,
  };
}

/** Name, type and link of each linked asset, for the scope list. */
export async function describeAssets(refs: (AssetRef & { isSubject: boolean })[]): Promise<DpiaAsset[]> {
  const out: DpiaAsset[] = [];
  const ids = (t: string) => refs.filter((r) => r.typeCode === t).map((r) => r.id);
  const subject = (t: string, id: number) => refs.some((r) => r.typeCode === t && r.id === id && r.isSubject);
  type Row = { id: number; name: string; sublabel: string | null; href: string | null };
  const push = (typeCode: string, typeName: string, rows: Row[]) => {
    for (const r of rows) out.push({ typeCode, id: Number(r.id), name: r.name, typeName, sublabel: r.sublabel, href: r.href, isSubject: subject(typeCode, Number(r.id)) });
  };
  if (ids("DATA_SOURCES").length) push("DATA_SOURCES", "Data source", await sql<Row[]>`
    SELECT data_source_id AS id, source_name_text AS name, NULL AS sublabel, NULL AS href FROM bayanat.data_sources WHERE data_source_id = ANY(${ids("DATA_SOURCES")}) ORDER BY 2`);
  if (ids("DATA_SCHEMAS").length) push("DATA_SCHEMAS", "Schema", await sql<Row[]>`
    SELECT s.schema_id AS id, s.schema_name_text AS name, ds.source_name_text AS sublabel, '/catalog/' || s.schema_id AS href
    FROM bayanat.data_schemas s JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id WHERE s.schema_id = ANY(${ids("DATA_SCHEMAS")}) ORDER BY 2`);
  if (ids("DATA_ENTITIES").length) push("DATA_ENTITIES", "Table", await sql<Row[]>`
    SELECT e.entity_id AS id, e.entity_name_text AS name, ds.source_name_text || ' › ' || s.schema_name_text AS sublabel, '/catalog/' || e.schema_id || '/tables/' || e.entity_id AS href
    FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    WHERE e.entity_id = ANY(${ids("DATA_ENTITIES")}) ORDER BY 2`);
  if (ids("DATA_ATTRIBUTES").length) push("DATA_ATTRIBUTES", "Column", await sql<Row[]>`
    SELECT a.attribute_id AS id, a.physical_name_text AS name, e.entity_name_text AS sublabel, '/catalog/' || e.schema_id || '/tables/' || e.entity_id AS href
    FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id WHERE a.attribute_id = ANY(${ids("DATA_ATTRIBUTES")}) ORDER BY 2`);
  const customIds = refs.filter((r) => isCustom(r.typeCode)).map((r) => r.id);
  if (customIds.length) {
    const rows = await sql<{ id: number; name: string; typeCode: string; typeName: string }[]>`
      SELECT ca.custom_asset_id AS id, ca.asset_name_text AS name, t.type_code AS "typeCode", t.type_name_text AS "typeName"
      FROM bayanat.custom_assets ca JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
      WHERE ca.custom_asset_id = ANY(${customIds}) ORDER BY 2`;
    for (const r of rows) {
      const typeCode = `CUSTOM:${r.typeCode}`;
      if (!refs.some((x) => x.typeCode === typeCode && x.id === Number(r.id))) continue;
      out.push({ typeCode, id: Number(r.id), name: r.name, typeName: r.typeName, sublabel: null, href: `/assets/${r.typeCode.toLowerCase()}/${r.id}`, isSubject: subject(typeCode, Number(r.id)) });
    }
  }
  return out.sort((a, b) => Number(b.isSubject) - Number(a.isSubject));
}
