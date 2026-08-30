/**
 * NAII req AI.AQ.GO.2-L0's standard/standard_code/standard_ar text ("Governance >
 * Governance > Organizational Enablement") doesn't match its own L1-L5 siblings
 * ("Data Specialty Areas > Governance > Organizational Enablement") — a typo in
 * the source workbook's row for this one indicator's Level 0 entry, confirmed
 * against "Regulation Frameworks Refresh - EN-AR v3.xlsx" directly.
 *
 * The Level 3 picker (components/governance/ComplianceClient.tsx) groups
 * requirements by exact `standard` text match, so this orphaned L0 row had zero
 * siblings in its own bucket and its own real bucket had zero Level-0 items —
 * the Level 0 card showed 0 items and rendered disabled, i.e. not selectable.
 * Confirmed via SQL this is the only base_code (req_code minus "-L<n>" suffix)
 * in NAII with more than one distinct `standard` value across its levels.
 *
 * Fix: repoint the L0 row's standard/standard_code/standard_ar at the value its
 * siblings already use.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

async function main() {
  const [correct] = await sql`
    SELECT standard, standard_code, standard_ar
    FROM bayanat.gov_compliance_requirements r
    JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = r.framework_id
    WHERE f.code = 'NAII' AND req_code = 'AI.AQ.GO.2-L1'
  `;
  if (!correct) throw new Error("Sibling row AI.AQ.GO.2-L1 not found — can't determine correct standard text");

  const updated = await sql`
    UPDATE bayanat.gov_compliance_requirements r
    SET standard = ${correct.standard}, standard_code = ${correct.standard_code}, standard_ar = ${correct.standard_ar}
    FROM bayanat.gov_compliance_frameworks f
    WHERE f.framework_id = r.framework_id AND f.code = 'NAII' AND r.req_code = 'AI.AQ.GO.2-L0'
    RETURNING r.req_id, r.req_code, r.standard
  `;
  console.log("Updated:", updated);

  // The "standard" translation key's base_text also needs correcting to match,
  // same mechanism as the .question/.supporting_evidence fixes in this script family.
  if (updated.length > 0) {
    const keyCode = `compliance.req.${updated[0].req_id}.standard`;
    const res = await sql`
      UPDATE bayanat.translation_keys SET base_text = ${correct.standard} WHERE key_code = ${keyCode}
    `;
    console.log(`Translation key ${keyCode}: ${res.count} row(s) updated`);
    if (correct.standard_ar) {
      const arRes = await sql`
        UPDATE bayanat.translations t SET translated_text = ${correct.standard_ar}, translated_at = now(), verified_at = now()
        FROM bayanat.translation_keys tk WHERE t.key_id = tk.key_id AND tk.key_code = ${keyCode} AND t.language_code = 'ar'
      `;
      console.log(`Arabic translation for ${keyCode}: ${arRes.count} row(s) updated`);
    }
  }

  console.log("\n--- Verification: distinct standards per NAII base_code ---");
  const check = await sql`
    SELECT regexp_replace(req_code, '-L[0-9]$', '') AS base_code, count(DISTINCT standard) AS n
    FROM bayanat.gov_compliance_requirements r
    JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = r.framework_id
    WHERE f.code = 'NAII'
    GROUP BY base_code HAVING count(DISTINCT standard) > 1
  `;
  console.log(check.length === 0 ? "No mismatches remain." : check);

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
