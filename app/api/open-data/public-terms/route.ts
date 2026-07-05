import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Classification codes that are NOT suitable for open data publication
const RESTRICTED_CODES = ["CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET", "PII"];

export type PublicTerm = {
  glossaryId:         number;
  termName:           string;
  definition:         string | null;
  classificationCode: string | null;
};

export async function GET(_req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restricted = RESTRICTED_CODES;

  const rows = await sql<PublicTerm[]>`
    SELECT
      glossary_id          AS "glossaryId",
      term_name_text       AS "termName",
      definition_text      AS "definition",
      classification_code  AS "classificationCode"
    FROM bayanat.business_glossaries
    WHERE classification_code IS NOT NULL
      AND classification_code <> ALL(${restricted})
    ORDER BY term_name_text
  `;

  return NextResponse.json(rows.map((r) => ({ ...r, glossaryId: Number(r.glossaryId) })));
}
