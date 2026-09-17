import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { termName, description, classCode, parentGlossaryId } = await req.json();
  if (!termName?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  try {
    const rows = await sql<{ id: number }[]>`
      INSERT INTO bayanat.business_glossaries
        (term_name_text, definition_text, classification_code, parent_glossary_id, term_type)
      VALUES (${termName.trim()}, ${description?.trim() || ""}, ${classCode || null}, ${parentGlossaryId || null},
              ${parentGlossaryId ? "SUBDOMAIN" : "DOMAIN"})
      RETURNING glossary_id AS id
    `;
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "Failed to create" }, { status: 500 });
  }
}
