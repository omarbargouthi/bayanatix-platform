// The registry of regulations and frameworks (db/163). A regulation is one thing shown
// in two places: as an entry on Governance Framework > Regulatory (gov_framework_docs,
// section REGULATORY) and as an assessable regulation on the Compliance and
// configuration pages (gov_compliance_frameworks). The entry points at its regulation
// (framework_id) and the two always carry the same name, version, description,
// effective date and official link — these helpers copy them across whichever side
// was just written.
import { sql } from "../db";

/** After a regulation was created or edited: create or refresh its Regulatory entry. */
export async function syncRegistryEntryFromRegulation(frameworkId: number, userId: string | null = null): Promise<void> {
  const [existing] = await sql<{ id: number }[]>`
    SELECT doc_id AS id FROM bayanat.gov_framework_docs WHERE framework_id = ${frameworkId}
  `;
  if (existing) {
    await sql`
      UPDATE bayanat.gov_framework_docs d
      SET title = f.name, description = f.description, version_text = f.version,
          effective_date = f.effective_date, source_url = f.official_url, updated_at = NOW()
      FROM bayanat.gov_compliance_frameworks f
      WHERE d.doc_id = ${existing.id} AND f.framework_id = ${frameworkId}
        AND (d.title, d.description, d.version_text, d.effective_date, d.source_url)
            IS DISTINCT FROM (f.name, f.description, f.version, f.effective_date, f.official_url)
    `;
    return;
  }
  await sql`
    INSERT INTO bayanat.gov_framework_docs
      (section_code, title, description, status_code, version_text, effective_date, source_url, created_by, framework_id)
    SELECT 'REGULATORY', f.name, f.description, 'APPROVED', f.version, f.effective_date, f.official_url, ${userId}, f.framework_id
    FROM bayanat.gov_compliance_frameworks f WHERE f.framework_id = ${frameworkId}
  `;
}

/** After a Regulatory entry was edited: carry its name and details to its regulation. */
export async function syncRegulationFromRegistryEntry(docId: number): Promise<void> {
  await sql`
    UPDATE bayanat.gov_compliance_frameworks f
    SET name = d.title, description = d.description, version = d.version_text,
        effective_date = d.effective_date, official_url = d.source_url
    FROM bayanat.gov_framework_docs d
    WHERE d.doc_id = ${docId} AND d.framework_id = f.framework_id
  `;
}

/** Points an existing Regulatory entry at a regulation (used when the entry came first). */
export async function linkRegistryEntry(docId: number, frameworkId: number): Promise<void> {
  await sql`UPDATE bayanat.gov_framework_docs SET framework_id = ${frameworkId} WHERE doc_id = ${docId}`;
}

/** A regulation code derived from its name ("Québec Law 25" -> "QUEBEC_LAW_25"), made unique. */
export async function uniqueRegulationCode(name: string): Promise<string> {
  const base = (name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30)) || "REGULATION";
  let code = base;
  for (let n = 2; ; n++) {
    const [taken] = await sql<{ x: number }[]>`SELECT 1 AS x FROM bayanat.gov_compliance_frameworks WHERE code = ${code}`;
    if (!taken) return code;
    code = `${base.slice(0, 27)}_${n}`;
  }
}

/** The regulation a Regulatory entry points at, with how much it already holds. */
export async function regulationOfRegistryEntry(docId: number): Promise<{ frameworkId: number; name: string; requirementCount: number } | null> {
  const [row] = await sql<{ frameworkId: number; name: string; requirementCount: number }[]>`
    SELECT f.framework_id AS "frameworkId", f.name,
           (SELECT count(*)::int FROM bayanat.gov_compliance_requirements r WHERE r.framework_id = f.framework_id) AS "requirementCount"
    FROM bayanat.gov_framework_docs d JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = d.framework_id
    WHERE d.doc_id = ${docId}
  `;
  return row ?? null;
}
