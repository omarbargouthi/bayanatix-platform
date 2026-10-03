import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// GET — the data access log (admin only): who viewed live sample data, when, and
// whether personal-data columns were shown in clear text. ?clearOnly=1 narrows it.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const clearOnly = sp.get("clearOnly") === "1";
  const page = Math.max(1, Number(sp.get("page") ?? 1));

  const rows = await sql<{
    accessId: number; accessedAt: string; userName: string | null; userId: string; entityId: number; entityName: string | null;
    schemaId: number | null; piColumnCount: number; clearText: boolean; clearTextBasis: string | null; rowCount: number | null; total: number;
  }[]>`
    SELECT l.access_id::float8 AS "accessId", l.accessed_at::text AS "accessedAt", u.full_name AS "userName", l.user_id AS "userId",
           l.asset_id AS "entityId", e.entity_name_text AS "entityName", e.schema_id AS "schemaId",
           l.pi_column_count AS "piColumnCount", l.clear_text AS "clearText", l.clear_text_basis AS "clearTextBasis",
           l.row_count AS "rowCount", count(*) OVER ()::int AS total
    FROM bayanat.data_access_log l
    LEFT JOIN bayanat.users u ON u.user_id = l.user_id
    LEFT JOIN bayanat.data_entities e ON l.asset_type_code = 'DATA_ENTITIES' AND e.entity_id = l.asset_id
    ${clearOnly ? sql`WHERE l.clear_text` : sql``}
    ORDER BY l.accessed_at DESC
    LIMIT 50 OFFSET ${(page - 1) * 50}
  `;
  return NextResponse.json({ rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 });
}
