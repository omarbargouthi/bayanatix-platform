import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export type GlossaryPickerTerm = {
  glossaryId: number;
  termName:   string;
  classCode:  string | null;
  isPii:      boolean;
};

export type GlossaryPickerDomain = {
  glossaryId: number;
  domainName: string;
  terms:      GlossaryPickerTerm[];
};

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{
    domainId:   number;
    domainName: string;
    termId:     number;
    termName:   string;
    classCode:  string | null;
    isPii:      boolean;
  }[]>`
    SELECT
      p.glossary_id          AS "domainId",
      p.term_name_text       AS "domainName",
      g.glossary_id          AS "termId",
      g.term_name_text       AS "termName",
      g.classification_code  AS "classCode",
      g.is_pii_indicator     AS "isPii"
    FROM bayanat.business_glossaries g
    JOIN bayanat.business_glossaries p ON p.glossary_id = g.parent_glossary_id
    WHERE g.parent_glossary_id IS NOT NULL
    ORDER BY p.term_name_text, g.term_name_text
  `;

  const domainMap = new Map<number, GlossaryPickerDomain>();
  for (const r of rows) {
    if (!domainMap.has(r.domainId)) {
      domainMap.set(r.domainId, { glossaryId: r.domainId, domainName: r.domainName, terms: [] });
    }
    domainMap.get(r.domainId)!.terms.push({
      glossaryId: r.termId,
      termName:   r.termName,
      classCode:  r.classCode,
      isPii:      r.isPii,
    });
  }

  return NextResponse.json([...domainMap.values()]);
}
