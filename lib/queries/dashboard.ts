import { sql } from "../db";
import type { ComplianceSnapshot, TrendPoint, RecentAsset } from "../types";

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// "Current vs previous period" for the Overall Compliance donut is driven by
// the same weighted-maturity trend history as the maturity chart below —
// compliance % = maturity score / 5 * 100, consistent with the domain cards.
export async function getComplianceSnapshot(): Promise<ComplianceSnapshot | null> {
  const rows = await sql<{ trend_year: number; trend_month: number; maturity_score: string }[]>`
    SELECT trend_year, trend_month, maturity_score
    FROM bayanat.maturity_trends
    ORDER BY trend_year DESC, trend_month DESC
    LIMIT 2
  `;
  if (rows.length === 0) return null;
  const toPct = (score: string) => Math.round((parseFloat(score) / 5) * 100);
  const label = (r: { trend_year: number; trend_month: number }) => `${MONTH_ABBR[r.trend_month - 1]} ${r.trend_year}`;
  return {
    current:      toPct(rows[0].maturity_score),
    previous:     rows.length > 1 ? toPct(rows[1].maturity_score) : toPct(rows[0].maturity_score),
    periodLabel:  label(rows[0]),
    prevLabel:    rows.length > 1 ? label(rows[1]) : label(rows[0]),
  };
}

export async function getMaturityTrends(year: number): Promise<TrendPoint[]> {
  return sql<TrendPoint[]>`
    SELECT
      trend_month     AS "month",
      maturity_score  AS "maturityScore"
    FROM bayanat.maturity_trends
    WHERE trend_year = ${year}
    ORDER BY trend_month
  `;
}

// The single live number every trend point (and the top-of-dashboard
// compliance/maturity cards) is ultimately derived from: NDI's weighted
// overall maturity score (0-5), weighted by each domain's configured share
// (Configuration → NDI 2026 → Domain Configuration). Mirrors the
// weighted_maturity CTE in lib/queries/domains.ts::getComplianceSummary.
export async function computeCurrentMaturityScore(): Promise<number> {
  const rows = await sql<{ score: string }[]>`
    WITH maturity_raw AS (
      SELECT DISTINCT
             split_part(r.standard_code, '.', 1) AS ndi_domain_code,
             r.standard_code,
             COALESCE(s.selected_level, 0)       AS selected_level
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.compliance_maturity_selections s
        ON   s.framework_id  = r.framework_id
        AND  s.standard_code = r.standard_code
      WHERE  r.compliance_or_maturity = 'نضج'
        AND  r.framework_id = 1
    ),
    domain_avg AS (
      SELECT ndi_domain_code, AVG(selected_level) AS avg_level
      FROM   maturity_raw
      GROUP  BY ndi_domain_code
    ),
    weighted AS (
      SELECT SUM(da.avg_level * cfg.weight) AS weighted_sum, SUM(cfg.weight) AS weight_sum
      FROM   domain_avg da
      JOIN   bayanat.gov_compliance_domain_config cfg
        ON   cfg.domain_code = da.ndi_domain_code AND cfg.framework_id = 1
    )
    SELECT COALESCE(ROUND(weighted_sum / NULLIF(weight_sum, 0), 2), 0)::text AS score
    FROM weighted
  `;
  return parseFloat(rows[0]?.score ?? "0");
}

// Called by the monthly cron (app/api/governance/cron/maturity-trend) to
// record the current live score as this month's trend data point.
export async function captureMaturityTrendSnapshot(): Promise<{ year: number; month: number; score: number }> {
  const score = await computeCurrentMaturityScore();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  await sql`
    INSERT INTO bayanat.maturity_trends (trend_year, trend_month, maturity_score)
    VALUES (${year}, ${month}, ${score})
    ON CONFLICT (trend_year, trend_month) DO UPDATE SET maturity_score = EXCLUDED.maturity_score
  `;
  return { year, month, score };
}

export async function getRecentAssets(userId: string, limit = 6): Promise<RecentAsset[]> {
  return sql<RecentAsset[]>`
    WITH latest AS (
      SELECT DISTINCT ON (asset_id, asset_type)
        asset_type  AS "assetType",
        asset_id    AS "assetId",
        asset_name  AS "assetName",
        asset_meta  AS "assetMeta",
        row_count::int AS "rowCount",
        visited_at  AS "visitedAt"
      FROM bayanat.user_recent_assets
      WHERE user_id = ${userId}
      ORDER BY asset_id, asset_type, visited_at DESC
    )
    SELECT
      l.*,
      CASE
        WHEN l."assetType" = 'SCHEMA' THEN
          '/catalog/' || l."assetId"
        WHEN l."assetType" = 'TABLE' THEN
          '/catalog/' || COALESCE(s.schema_id::text, '1') || '/tables/' || l."assetId"
        WHEN l."assetType" = 'COLUMN' THEN
          '/catalog/' || COALESCE(e.schema_id::text, '1') || '/tables/' || COALESCE(e.entity_id::text, '1')
        ELSE '/glossary/' || l."assetId"
      END AS "href"
    FROM latest l
    LEFT JOIN bayanat.data_schemas  s ON s.schema_name_text = l."assetMeta" AND l."assetType" = 'TABLE'
    LEFT JOIN bayanat.data_entities e ON e.entity_name_text = l."assetMeta" AND l."assetType" = 'COLUMN'
    ORDER BY l."visitedAt" DESC
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
    DELETE FROM bayanat.user_recent_assets
    WHERE user_id = ${userId} AND asset_type = ${assetType} AND asset_id = ${assetId}
  `;
  await sql`
    INSERT INTO bayanat.user_recent_assets
      (user_id, asset_type, asset_id, asset_name, asset_meta, row_count)
    VALUES (${userId}, ${assetType}, ${assetId}, ${assetName}, ${assetMeta ?? null}, ${rowCount ?? null})
  `;
}
