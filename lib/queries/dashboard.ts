import { sql } from "../db";
import type { ComplianceSnapshot, TrendPoint, RecentAsset } from "../types";

export async function getComplianceSnapshot(): Promise<ComplianceSnapshot | null> {
  const rows = await sql<{ overall_pct: string; period_label: string }[]>`
    SELECT overall_pct, period_label
    FROM bayanat.compliance_snapshots
    ORDER BY period_date DESC
    LIMIT 2
  `;
  if (rows.length === 0) return null;
  return {
    current:      parseFloat(rows[0].overall_pct),
    previous:     rows.length > 1 ? parseFloat(rows[1].overall_pct) : parseFloat(rows[0].overall_pct),
    periodLabel:  rows[0].period_label,
    prevLabel:    rows.length > 1 ? rows[1].period_label : rows[0].period_label,
  };
}

export async function getMaturityTrends(year: number): Promise<TrendPoint[]> {
  return sql<TrendPoint[]>`
    SELECT
      trend_month  AS "month",
      ndi_score    AS "ndiScore",
      naii_score   AS "naiiScore"
    FROM bayanat.maturity_trends
    WHERE trend_year = ${year}
    ORDER BY trend_month
  `;
}

export async function getRecentAssets(userId: string, limit = 6): Promise<RecentAsset[]> {
  return sql<RecentAsset[]>`
    SELECT DISTINCT ON (a.asset_id, a.asset_type)
      a.asset_type  AS "assetType",
      a.asset_id    AS "assetId",
      a.asset_name  AS "assetName",
      a.asset_meta  AS "assetMeta",
      a.row_count::int AS "rowCount",
      a.visited_at  AS "visitedAt",
      CASE
        WHEN a.asset_type = 'TABLE' THEN
          '/catalog/' || COALESCE(s.schema_id::text, '1') || '?highlight=' || a.asset_id
        WHEN a.asset_type = 'COLUMN' THEN
          '/catalog/' || COALESCE(e.schema_id::text, '1') || '/tables/' || COALESCE(e.entity_id::text, '1')
        ELSE '/catalog'
      END AS "href"
    FROM bayanat.user_recent_assets a
    LEFT JOIN bayanat.data_schemas  s ON s.schema_name_text = a.asset_meta AND a.asset_type = 'TABLE'
    LEFT JOIN bayanat.data_entities e ON e.entity_name_text = a.asset_meta AND a.asset_type = 'COLUMN'
    WHERE a.user_id = ${userId}
    ORDER BY a.asset_id, a.asset_type, a.visited_at DESC
    LIMIT ${limit}
  `;
}

export async function getRecentSearches(userId: string, limit = 5): Promise<string[]> {
  const rows = await sql<{ query: string }[]>`
    SELECT DISTINCT ON (query) query, searched_at
    FROM bayanat.user_searches
    WHERE user_id = ${userId}
    ORDER BY query, searched_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.query);
}

export async function saveSearch(userId: string, query: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.user_searches (user_id, query) VALUES (${userId}, ${query})
  `;
}

export async function trackAssetVisit(
  userId: string,
  assetType: string,
  assetId: string,
  assetName: string,
  assetMeta?: string,
  rowCount?: number,
): Promise<void> {
  await sql`
    INSERT INTO bayanat.user_recent_assets
      (user_id, asset_type, asset_id, asset_name, asset_meta, row_count)
    VALUES (${userId}, ${assetType}, ${assetId}, ${assetName}, ${assetMeta ?? null}, ${rowCount ?? null})
  `;
}
