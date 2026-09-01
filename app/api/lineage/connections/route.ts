import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// GET /api/lineage/connections?dbTypeCode=POWERBI,FABRIC — small lookup used by
// upload/scan UIs to populate a "which connection does this belong to" picker.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const codesParam = searchParams.get("dbTypeCode");
  const codes = codesParam ? codesParam.split(",").map((c) => c.trim()).filter(Boolean) : null;

  const rows = await sql<{ connectionId: number; connectionName: string; dbTypeCode: string }[]>`
    SELECT connection_id AS "connectionId", connection_name AS "connectionName", db_type_code AS "dbTypeCode"
    FROM bayanat.connection_registry
    WHERE ${codes ? sql`db_type_code IN ${sql(codes)}` : sql`true`}
    ORDER BY connection_name
  `;
  return NextResponse.json(rows);
}
