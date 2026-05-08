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
    SELECT DISTINCT ON (asset_id, asset_type)
      asset_type  AS "assetType",
      asset_id    AS "assetId",
      asset_name  AS "assetName",
      asset_meta  AS "assetMeta",
      row_count::int   AS "rowCount",
      visited_at  AS "visitedAt"
    FROM bayanat.user_recent_assets
    WHERE user_id = ${userId}
    ORDER BY asset_id, asset_type, visited_at DESC
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
