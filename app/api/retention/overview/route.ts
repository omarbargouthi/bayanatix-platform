import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json({
    totalCategories:    countRows[0].totalCategories,
    totalSchedules:     countRows[0].totalSchedules,
    activeHolds:        holdRows[0].active,
    entitiesClassified: entityRows[0].classified,
    entitiesTotal:      entityRows[0].total,
    expiringSoon:       entityRows[0].expiringSoon,
    overdue:            entityRows[0].overdue,
    byStatus:           statusRows,
    bySensitivity:      sensitivityRows,
  });
}
