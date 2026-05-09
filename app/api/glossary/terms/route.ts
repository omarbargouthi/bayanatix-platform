import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const {
    termName, parentGlossaryId, definition, termType,
    classCode, isPii, piCategoryCode, format, businessRules, example,
  } = await req.json();
  if (!termName?.trim())     return NextResponse.json({ error: "Term name is required" },  { status: 400 });
  if (!parentGlossaryId)     return NextResponse.json({ error: "Domain is required" },     { status: 400 });
  if (!definition?.trim())   return NextResponse.json({ error: "Definition is required" }, { status: 400 });
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.business_glossaries
      (term_name_text, parent_glossary_id, definition_text, term_type,
       classification_code, is_pii_indicator, pi_category_code, format_text, business_rules_text, example_text)
    VALUES
      (${termName.trim()}, ${parentGlossaryId}, ${definition.trim()},
       ${termType || 'TERM'}, ${classCode || null}, ${!!isPii}, ${isPii ? (piCategoryCode || null) : null},
       ${format || null}, ${businessRules || null}, ${example || null})
    RETURNING glossary_id AS id
  `;
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
