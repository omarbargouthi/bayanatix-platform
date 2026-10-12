// Source system statistics — the "Source Systems" report (Reports › Source Systems) and
// the Dashboard, which shows the same figures for the sources the signed-in user has a
// governance role on. Every figure is defined here once, scoped by a list of source ids.
import { sql } from "../db";
import type { SessionUser } from "../types";
import { canManageDomain } from "../can";

/** Source ids to report on; null = every source. An empty list reports nothing. */
export type SourceScope = number[] | null;

export type Slice = { code: string | null; label: string; value: number };
export type SourceLite = { id: number; name: string; typeCode: string | null };
export type StewardLite = { userId: string; fullName: string };

export type SourceStats = {
  counts: { sources: number; schemas: number; objects: number; columns: number };
  sourceTypes: Slice[];
  objectTypes: Slice[];
  /** Tables by table type (Master, Transactional, …); code null = not classified. */
  tableTypes: Slice[];
  /** Columns by column type (Business, Measure, Technical); code null = not classified. */
  columnTypes: Slice[];
  /** Columns by data classification level; code null = not classified. */
  classification: Slice[];
  /** Tables holding a certification, per dimension and tier. */
  certification: { dimension: "METADATA" | "DATA"; tier: string; value: number }[];
  certifiedObjects: number;
  ratings: { average: number | null; ratingCount: number; ratedObjects: number; distribution: { stars: number; value: number }[] };
};

export type TopAsset = {
  entityId: number; schemaId: number; name: string; sourceName: string; schemaName: string;
  /** The ranked figure: views, matching searches, or average stars. */
  value: number;
  /** Its companion: distinct users, or number of ratings. */
  detail: number;
};
export type TopAssets = { mostUsed: TopAsset[]; mostSearched: TopAsset[]; highestRated: TopAsset[]; lowestRated: TopAsset[] };

/** How far back "most used" and "most searched" look. */
export const ACTIVITY_WINDOW_DAYS = 90;

// The Data Management Office side sees every source: administrators, governance
// officers, whoever manages the Data Governance domain, and holders of a role named for
// the DMO, compliance or data governance (e.g. "DMO Manager", "Compliance Officer").
// Everyone else sees the sources they hold a governance role on.
export async function canSeeAllSources(session: SessionUser): Promise<boolean> {
  if (session.role === "ADMIN" || session.role === "OFFICER") return true;
  if (await canManageDomain(session, "GOVERNANCE")) return true;
  const rows = await sql`
    SELECT 1
    FROM   bayanat.role_assignments ra
    JOIN   bayanat.roles r ON r.role_id = ra.role_id
    LEFT   JOIN bayanat.team_members tm ON tm.team_id = ra.team_id
    WHERE  coalesce(ra.user_id, tm.user_id) = ${session.userId}
      AND  (r.role_name ILIKE '%DMO%' OR r.role_name ILIKE '%Data Management Office%'
         OR r.role_name ILIKE '%Compliance%' OR r.role_name ILIKE '%Data Governance Officer%')
    LIMIT 1
  `;
  return rows.length > 0;
}

/** The sources a user has a governance role on: on the source itself, or on a schema or table in it. */
export async function getGovernedSourceIds(userId: string): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`
    SELECT st.asset_id AS id
    FROM   bayanat.asset_stakeholders st
    WHERE  st.user_id = ${userId} AND st.asset_type_code = 'DATA_SOURCES'
    UNION
    SELECT s.data_source_id
    FROM   bayanat.asset_stakeholders st
    JOIN   bayanat.data_schemas s ON s.schema_id = st.asset_id
    WHERE  st.user_id = ${userId} AND st.asset_type_code = 'DATA_SCHEMAS'
    UNION
    SELECT s.data_source_id
    FROM   bayanat.asset_stakeholders st
    JOIN   bayanat.data_entities e ON e.entity_id = st.asset_id
    JOIN   bayanat.data_schemas  s ON s.schema_id = e.schema_id
    WHERE  st.user_id = ${userId} AND st.asset_type_code = 'DATA_ENTITIES'
  `;
  return rows.map((r) => Number(r.id));
}

export async function listSources(scope: SourceScope): Promise<SourceLite[]> {
  return sql<SourceLite[]>`
    SELECT data_source_id AS id, source_name_text AS name, source_type_code AS "typeCode"
    FROM   bayanat.data_sources
    WHERE  ${scope === null} OR data_source_id = ANY(${scope ?? []}::int[])
    ORDER  BY source_name_text
  `;
}

/** Everyone who holds a governance role on a source, schema or table. */
export async function listSourceStewards(): Promise<StewardLite[]> {
  return sql<StewardLite[]>`
    SELECT DISTINCT u.user_id AS "userId", coalesce(u.full_name, u.user_id) AS "fullName"
    FROM   bayanat.asset_stakeholders st
    JOIN   bayanat.users u ON u.user_id = st.user_id
    WHERE  st.asset_type_code IN ('DATA_SOURCES', 'DATA_SCHEMAS', 'DATA_ENTITIES')
    ORDER  BY 2
  `;
}

/**
 * The scope a request is allowed and asking for. A user who sees all sources may narrow
 * to one source and/or one steward's sources; anyone else is held to their own sources
 * and may narrow to one of them. Whatever the request asks, the result never leaves
 * what the user may see.
 *
 * `ownByDefault` (the Dashboard): with no filter chosen, even a user who may see every
 * source starts on the sources they personally hold a governance role on, and reaches
 * the rest by asking for them (`all`, a source, or a steward). `isOwn` says the result
 * is that personal view.
 */
export async function resolveSourceScope(
  session: SessionUser,
  requested: { sourceId?: number | null; stewardId?: string | null; all?: boolean; ownByDefault?: boolean },
): Promise<{ scope: SourceScope; seesAll: boolean; allowed: SourceScope; isOwn: boolean }> {
  const seesAll = await canSeeAllSources(session);
  const hasSource = requested.sourceId != null && Number.isFinite(requested.sourceId);
  const wantsOwn = !!requested.ownByDefault && !(seesAll && (requested.all || requested.stewardId || hasSource));
  const own = !seesAll || wantsOwn ? await getGovernedSourceIds(session.userId) : [];
  const allowed: SourceScope = seesAll ? null : own;
  let scope: SourceScope = wantsOwn ? own : allowed;
  if (seesAll && requested.stewardId) scope = await getGovernedSourceIds(requested.stewardId);
  if (hasSource) {
    scope = scope === null || scope.includes(requested.sourceId!) ? [requested.sourceId!] : [];
  }
  return { scope, seesAll, allowed, isOwn: !seesAll || wantsOwn };
}

const inScope = (scope: SourceScope, column: string) =>
  sql`(${scope === null} OR ${sql.unsafe(column)} = ANY(${scope ?? []}::int[]))`;

export async function getSourceStats(scope: SourceScope): Promise<SourceStats> {
  const [counts, sourceTypes, objectTypes, tableTypes, columnTypes, classification, certification, ratingRows] = await Promise.all([
    sql<{ sources: number; schemas: number; objects: number; columns: number }[]>`
      SELECT
        (SELECT count(*)::int FROM bayanat.data_sources ds WHERE ${inScope(scope, "ds.data_source_id")}) AS sources,
        (SELECT count(*)::int FROM bayanat.data_schemas s WHERE ${inScope(scope, "s.data_source_id")}) AS schemas,
        (SELECT count(*)::int FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
          WHERE ${inScope(scope, "s.data_source_id")}) AS objects,
        (SELECT count(*)::int FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
          JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id WHERE ${inScope(scope, "s.data_source_id")}) AS columns
    `,
    sql<Slice[]>`
      SELECT ds.source_type_code AS code, coalesce(ds.source_type_code, '') AS label, count(*)::int AS value
      FROM   bayanat.data_sources ds
      WHERE  ${inScope(scope, "ds.data_source_id")}
      GROUP  BY ds.source_type_code ORDER BY 3 DESC, 2
    `,
    sql<Slice[]>`
      SELECT coalesce(e.object_type_code, CASE WHEN e.is_view_indicator THEN 'VIEW' ELSE 'TABLE' END) AS code,
             initcap(replace(coalesce(e.object_type_code, CASE WHEN e.is_view_indicator THEN 'VIEW' ELSE 'TABLE' END), '_', ' ')) AS label,
             count(*)::int AS value
      FROM   bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE  ${inScope(scope, "s.data_source_id")}
      GROUP  BY 1, 2 ORDER BY 3 DESC, 2
    `,
    sql<Slice[]>`
      SELECT e.entity_category_code AS code, coalesce(l.lookup_label, e.entity_category_code, '') AS label, count(*)::int AS value
      FROM   bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      LEFT   JOIN bayanat.app_lookups l ON l.lookup_group = 'TABLE_TYPE' AND l.lookup_code = e.entity_category_code
      WHERE  ${inScope(scope, "s.data_source_id")}
      GROUP  BY e.entity_category_code, l.lookup_label ORDER BY (e.entity_category_code IS NULL), 3 DESC, 2
    `,
    sql<Slice[]>`
      SELECT a.attribute_class_code AS code, coalesce(initcap(a.attribute_class_code), '') AS label, count(*)::int AS value
      FROM   bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      JOIN   bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE  ${inScope(scope, "s.data_source_id")}
      GROUP  BY a.attribute_class_code ORDER BY (a.attribute_class_code IS NULL), 3 DESC, 2
    `,
    sql<Slice[]>`
      SELECT a.classification_code AS code, coalesce(l.lookup_label, a.classification_code, '') AS label, count(*)::int AS value
      FROM   bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      JOIN   bayanat.data_schemas s ON s.schema_id = e.schema_id
      LEFT   JOIN bayanat.app_lookups l ON l.lookup_group = 'CLASSIFICATION' AND l.lookup_code = a.classification_code
      WHERE  ${inScope(scope, "s.data_source_id")}
      GROUP  BY a.classification_code, l.lookup_label ORDER BY (a.classification_code IS NULL), 3 DESC, 2
    `,
    sql<{ dimension: "METADATA" | "DATA"; tier: string; value: number; certified: number }[]>`
      WITH certs AS (
        SELECT c.asset_id AS entity_id, coalesce(c.cert_dimension, 'METADATA') AS dimension, c.cert_type_code AS tier
        FROM   bayanat.asset_certifications c
        JOIN   bayanat.data_entities e ON e.entity_id = c.asset_id
        JOIN   bayanat.data_schemas  s ON s.schema_id = e.schema_id
        WHERE  c.asset_type_code = 'DATA_ENTITIES' AND (c.expiry_date IS NULL OR c.expiry_date >= current_date)
          AND  ${inScope(scope, "s.data_source_id")}
      )
      SELECT dimension, tier, count(DISTINCT entity_id)::int AS value,
             (SELECT count(DISTINCT entity_id)::int FROM certs) AS certified
      FROM   certs GROUP BY dimension, tier
    `,
    sql<{ stars: number; value: number; rated: number; average: number | null }[]>`
      WITH r AS (
        SELECT ar.stars, ar.asset_id
        FROM   bayanat.asset_ratings ar
        JOIN   bayanat.data_entities e ON e.entity_id = ar.asset_id
        JOIN   bayanat.data_schemas  s ON s.schema_id = e.schema_id
        WHERE  ar.asset_type_code = 'DATA_ENTITIES' AND ${inScope(scope, "s.data_source_id")}
      )
      SELECT g.stars::int AS stars, count(r.stars)::int AS value,
             (SELECT count(DISTINCT asset_id)::int FROM r) AS rated,
             (SELECT round(avg(stars), 2)::float8 FROM r) AS average
      FROM   generate_series(1, 5) AS g(stars)
      LEFT   JOIN r ON r.stars = g.stars
      GROUP  BY g.stars ORDER BY g.stars DESC
    `,
  ]);

  return {
    counts: counts[0] ?? { sources: 0, schemas: 0, objects: 0, columns: 0 },
    sourceTypes, objectTypes, tableTypes, columnTypes, classification,
    certification: certification.map(({ dimension, tier, value }) => ({ dimension, tier, value })),
    certifiedObjects: certification[0]?.certified ?? 0,
    ratings: {
      average: ratingRows[0]?.average ?? null,
      ratingCount: ratingRows.reduce((n, r) => n + r.value, 0),
      ratedObjects: ratingRows[0]?.rated ?? 0,
      distribution: ratingRows.map(({ stars, value }) => ({ stars, value })),
    },
  };
}

export async function getTopAssets(scope: SourceScope, limit = 5): Promise<TopAssets> {
  // The tables in scope, with what a list row shows.
  const SCOPED = sql`
    scoped AS (
      SELECT e.entity_id, e.schema_id, coalesce(e.display_name_text, e.entity_name_text) AS name,
             e.entity_name_text AS physical_name, ds.source_name_text AS source_name, s.schema_name_text AS schema_name
      FROM   bayanat.data_entities e
      JOIN   bayanat.data_schemas s  ON s.schema_id = e.schema_id
      JOIN   bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      WHERE  ${inScope(scope, "s.data_source_id")}
    )
  `;
  const COLUMNS = sql`sc.entity_id AS "entityId", sc.schema_id AS "schemaId", sc.name, sc.source_name AS "sourceName", sc.schema_name AS "schemaName"`;
  const since = sql`now() - (${ACTIVITY_WINDOW_DAYS} * interval '1 day')`;

  const [mostUsed, mostSearched, highestRated, lowestRated] = await Promise.all([
    // Used = opened in Bayanis.
    sql<TopAsset[]>`
      WITH ${SCOPED}
      SELECT ${COLUMNS}, count(*)::int AS value, count(DISTINCT v.user_id)::int AS detail
      FROM   bayanat.user_recent_assets v
      JOIN   scoped sc ON sc.entity_id::text = v.asset_id
      WHERE  v.asset_type = 'TABLE' AND v.visited_at >= ${since}
      GROUP  BY sc.entity_id, sc.schema_id, sc.name, sc.source_name, sc.schema_name
      ORDER  BY value DESC, detail DESC, sc.name LIMIT ${limit}
    `,
    // Searched = its name contains what someone searched for (3 characters or more).
    sql<TopAsset[]>`
      WITH ${SCOPED},
      searches AS (
        SELECT lower(btrim(query_text)) AS q, user_id
        FROM   bayanat.search_analytics
        WHERE  searched_at >= ${since} AND length(btrim(query_text)) >= 3
      )
      SELECT ${COLUMNS}, count(*)::int AS value, count(DISTINCT se.user_id)::int AS detail
      FROM   searches se
      JOIN   scoped sc ON position(se.q IN lower(sc.name)) > 0 OR position(se.q IN lower(sc.physical_name)) > 0
      GROUP  BY sc.entity_id, sc.schema_id, sc.name, sc.source_name, sc.schema_name
      ORDER  BY value DESC, detail DESC, sc.name LIMIT ${limit}
    `,
    sql<TopAsset[]>`
      WITH ${SCOPED}
      SELECT ${COLUMNS}, round(avg(ar.stars), 2)::float8 AS value, count(*)::int AS detail
      FROM   bayanat.asset_ratings ar
      JOIN   scoped sc ON sc.entity_id = ar.asset_id
      WHERE  ar.asset_type_code = 'DATA_ENTITIES'
      GROUP  BY sc.entity_id, sc.schema_id, sc.name, sc.source_name, sc.schema_name
      ORDER  BY value DESC, detail DESC, sc.name LIMIT ${limit}
    `,
    sql<TopAsset[]>`
      WITH ${SCOPED}
      SELECT ${COLUMNS}, round(avg(ar.stars), 2)::float8 AS value, count(*)::int AS detail
      FROM   bayanat.asset_ratings ar
      JOIN   scoped sc ON sc.entity_id = ar.asset_id
      WHERE  ar.asset_type_code = 'DATA_ENTITIES'
      GROUP  BY sc.entity_id, sc.schema_id, sc.name, sc.source_name, sc.schema_name
      ORDER  BY value ASC, detail DESC, sc.name LIMIT ${limit}
    `,
  ]);
  return { mostUsed, mostSearched, highestRated, lowestRated };
}
