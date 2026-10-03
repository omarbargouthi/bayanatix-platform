import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Transformation types for the manual lineage editor's pickers.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{ code: string; name: string; description: string | null }[]>`
    SELECT transformation_type_code AS code, transformation_type_name_text AS name, description_text AS description
    FROM bayanat.lineage_transformation_types
    WHERE transformation_type_code <> 'UNKNOWN'
    ORDER BY CASE transformation_type_code WHEN 'MANUAL' THEN 0 WHEN 'DIRECT' THEN 1 ELSE 2 END, transformation_type_name_text
  `;
  return NextResponse.json(rows);
}
