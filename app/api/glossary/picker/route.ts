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

  // Groups by the top-level DOMAIN, not the immediate parent — a term can sit
  // under an intermediate SUBDOMAIN (Domain > Subdomain > Term), which would
  // otherwise show the subdomain's name as if it were itself a domain group.
  const rows = await sql<{
    domainId:   number;
    domainName: string;
    termId:     number;
    termName:   string;
    classCode:  string | null;
    isPii:      boolean;
  }[]>`
    WITH RECURSIVE ancestry AS (
      SELECT glossary_id, glossary_id AS root_id, term_name_text AS root_name
      FROM bayanat.business_glossaries WHERE parent_glossary_id IS NULL
      UNION ALL
      SELECT c.glossary_id, a.root_id, a.root_name
      FROM bayanat.business_glossaries c JOIN ancestry a ON c.parent_glossary_id = a.glossary_id
    )
    SELECT
      anc.root_id             AS "domainId",
      anc.root_name           AS "domainName",
      g.glossary_id          AS "termId",
      g.term_name_text       AS "termName",
      g.classification_code  AS "classCode",
      g.is_pii_indicator     AS "isPii"
    FROM bayanat.business_glossaries g
    JOIN ancestry anc ON anc.glossary_id = g.glossary_id
    WHERE g.parent_glossary_id IS NOT NULL AND g.term_type IN ('TERM', 'KPI_METRIC')
    ORDER BY anc.root_name, g.term_name_text
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
