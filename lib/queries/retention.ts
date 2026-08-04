import { sql } from "../db";
import type { RetentionOverview } from "../types";

export async function getRetentionOverview(): Promise<RetentionOverview> {
  const [
    countRows,
    holdRows,
    entityRows,
    statusRows,
    sensitivityRows,
  ] = await Promise.all([
    sql<{ totalCategories: number; totalSchedules: number }[]>`
      SELECT
        (SELECT COUNT(*) FROM bayanat.data_categories WHERE is_active = true)::int AS "totalCategories",
        (SELECT COUNT(*) FROM bayanat.retention_schedules)::int                    AS "totalSchedules"
    `,

    sql<{ active: number }[]>`
      SELECT COUNT(*)::int AS active
      FROM bayanat.legal_holds
      WHERE hold_status = 'ACTIVE'
    `,

    sql<{ classified: number; total: number; expiringSoon: number; overdue: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE retention_category_id IS NOT NULL)::int      AS classified,
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (
          WHERE effective_expiry_date IS NOT NULL
            AND effective_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        )::int AS "expiringSoon",
        COUNT(*) FILTER (
          WHERE effective_expiry_date IS NOT NULL
            AND effective_expiry_date < CURRENT_DATE
            AND (retention_status IS NULL OR retention_status NOT IN ('PURGED','ARCHIVED'))
        )::int AS overdue
      FROM bayanat.data_entities
    `,

    sql<{ status: string; count: number }[]>`
      SELECT retention_status AS status, COUNT(*)::int AS count
      FROM bayanat.data_entities
      WHERE retention_status IS NOT NULL
      GROUP BY retention_status
      ORDER BY count DESC
    `,

    sql<{ sensitivity: string; count: number }[]>`
      SELECT dc.sensitivity, COUNT(de.entity_id)::int AS count
      FROM bayanat.data_categories dc
      JOIN bayanat.data_entities de ON de.retention_category_id = dc.category_id
      GROUP BY dc.sensitivity
      ORDER BY count DESC
    `,
  ]);

  return {
    totalCategories:    countRows[0].totalCategories,
    totalSchedules:     countRows[0].totalSchedules,
    activeHolds:        holdRows[0].active,
    entitiesClassified: entityRows[0].classified,
    entitiesTotal:      entityRows[0].total,
    expiringSoon:       entityRows[0].expiringSoon,
    overdue:            entityRows[0].overdue,
    byStatus:           statusRows,
    bySensitivity:      sensitivityRows,
  };
}

// % of active retention categories that have at least one retention schedule defined.
export async function getCategoriesWithSchedulePct(): Promise<number> {
  const [row] = await sql<{ withSchedule: number; total: number }[]>`
    SELECT
      COUNT(DISTINCT rs.category_id) FILTER (WHERE dc.is_active)::int AS "withSchedule",
      COUNT(DISTINCT dc.category_id) FILTER (WHERE dc.is_active)::int AS total
    FROM bayanat.data_categories dc
    LEFT JOIN bayanat.retention_schedules rs ON rs.category_id = dc.category_id
  `;
  return row.total > 0 ? Math.round((row.withSchedule / row.total) * 100) : 0;
}

// Overdue assets grouped by what their category's default schedule says should
// happen to them — the closest honest proxy for a "purge queue" (no dedicated
// purge-queue table exists in this schema).
export async function getPurgeQueueByAction(): Promise<{ action: string; count: number }[]> {
  return sql<{ action: string; count: number }[]>`
    SELECT COALESCE(rs.post_retention_action, 'UNSCHEDULED') AS action, COUNT(*)::int AS count
    FROM bayanat.data_entities e
    LEFT JOIN bayanat.retention_schedules rs
      ON rs.category_id = e.retention_category_id AND rs.is_default = true
    WHERE e.effective_expiry_date IS NOT NULL
      AND e.effective_expiry_date < CURRENT_DATE
      AND (e.retention_status IS NULL OR e.retention_status NOT IN ('PURGED','ARCHIVED'))
    GROUP BY COALESCE(rs.post_retention_action, 'UNSCHEDULED')
    ORDER BY count DESC
  `;
}
