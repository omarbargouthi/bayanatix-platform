import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{ code: string; name: string }[]>`
    SELECT dimension_code AS code, dimension_name_text AS name
    FROM bayanat.dq_dimensions ORDER BY dimension_code
  `;

  return NextResponse.json(rows);
}
