import { sql } from "../db";

// ── Layout persistence ───────────────────────────────────────────────────────

export async function getHomepageLayout(userId: string): Promise<string[] | null> {
  const rows = await sql<{ widgetKeys: string[] }[]>`
    SELECT widget_keys AS "widgetKeys" FROM bayanat.user_homepage_layout WHERE user_id = ${userId}
  `;
  return rows[0]?.widgetKeys ?? null;
}

export async function saveHomepageLayout(userId: string, widgetKeys: string[]): Promise<void> {
  await sql`
    INSERT INTO bayanat.user_homepage_layout (user_id, widget_keys, updated_at)
    VALUES (${userId}, ${widgetKeys}, now())
    ON CONFLICT (user_id) DO UPDATE SET widget_keys = EXCLUDED.widget_keys, updated_at = now()
  `;
}

// ── My Requests widget ───────────────────────────────────────────────────────
// Adapted from app/(app)/profile/page.tsx's two inline queries — same shape,
// but LIMIT 5 + counts for a compact widget preview instead of full lists.

export type MyRequestItem = {
  requestId: number; title: string; priorityCode: string; statusCode: string;
  createdAt: string; source: "RAISED" | "ON_MY_ASSET";
};
export type MyRequestsSummary = { openCount: number; items: MyRequestItem[] };

export async function getMyRequestsSummary(userId: string): Promise<MyRequestsSummary> {
  const [raised, onMyAssets] = await Promise.all([
    sql<MyRequestItem[]>`
      SELECT
        ar.request_id AS "requestId", ar.title, ar.priority_code AS "priorityCode",
        ar.status_code AS "statusCode", ar.created_at::text AS "createdAt", 'RAISED' AS "source"
      FROM bayanat.asset_requests ar
      WHERE ar.raised_by_user_id = ${userId} AND ar.status_code IN ('OPEN', 'IN_PROGRESS')
      ORDER BY ar.created_at DESC
    `,
    sql<MyRequestItem[]>`
      SELECT DISTINCT ON (ar.request_id)
        ar.request_id AS "requestId", ar.title, ar.priority_code AS "priorityCode",
        ar.status_code AS "statusCode", ar.created_at::text AS "createdAt", 'ON_MY_ASSET' AS "source"
      FROM bayanat.asset_requests ar
      JOIN bayanat.asset_request_targets art ON art.request_id = ar.request_id
      JOIN bayanat.asset_stakeholders stk
        ON stk.asset_type_code = art.asset_type_code AND stk.asset_id = art.asset_id AND stk.user_id = ${userId}
      WHERE ar.status_code IN ('OPEN', 'IN_PROGRESS') AND ar.raised_by_user_id != ${userId}
      ORDER BY ar.request_id, ar.created_at DESC
    `,
  ]);
  const items = [...raised, ...onMyAssets]
    .sort((a, b) => {
      const rank = (c: string) => (c === "HIGH" ? 0 : c === "MEDIUM" ? 1 : 2);
      const r = rank(a.priorityCode) - rank(b.priorityCode);
      return r !== 0 ? r : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, 5);
  return { openCount: raised.length + onMyAssets.length, items };
}

// ── My Domains (steward) widget ──────────────────────────────────────────────

export type StewardDomain = { glossaryId: number; name: string; openRequestCount: number };

export async function getMyStewardDomains(userId: string): Promise<StewardDomain[]> {
  return sql<StewardDomain[]>`
    SELECT
      bg.glossary_id AS "glossaryId",
      bg.term_name_text AS "name",
      (
        SELECT count(DISTINCT ar.request_id)::int
        FROM bayanat.asset_requests ar
        JOIN bayanat.asset_request_targets art
          ON art.request_id = ar.request_id AND art.asset_type_code = 'DATA_ENTITIES'
        JOIN bayanat.v_entity_business_domain vbd ON vbd.entity_id = art.asset_id
        WHERE ar.status_code IN ('OPEN', 'IN_PROGRESS') AND vbd.domain_glossary_id = bg.glossary_id
      ) AS "openRequestCount"
    FROM bayanat.glossary_stewards gs
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = gs.glossary_id
    WHERE gs.user_id = ${userId}
    ORDER BY bg.term_name_text
  `;
}
