import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{ glossaryId: number; termName: string; classCode: string }[]>`
    SELECT
      glossary_id       AS "glossaryId",
      term_name_text    AS "termName",
      classification_code AS "classCode"
    FROM bayanat.business_glossaries
    WHERE classification_code IS NOT NULL
    ORDER BY
      CASE classification_code
        WHEN 'PUBLIC'       THEN 1
        WHEN 'INTERNAL'     THEN 2
        WHEN 'CONFIDENTIAL' THEN 3
        WHEN 'RESTRICTED'   THEN 4
        WHEN 'SECRET'       THEN 5
        WHEN 'TOP_SECRET'   THEN 6
        ELSE 7
      END,
      term_name_text
  `;

  return NextResponse.json(rows);
}
