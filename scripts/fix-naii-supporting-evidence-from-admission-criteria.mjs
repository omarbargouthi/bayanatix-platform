/**
 * Correction to scripts/backfill-supporting-evidence-from-requirement.mjs: for
 * NAII specifically, the source workbook's Admission Criteria column already
 * embeds the real "— Supporting Evidence: ..." text per level (confirmed by
 * inspecting the raw column), not the bare Requirement/question text used for
 * the other 4 frameworks. Re-point NAII's supporting_evidence_en/supporting_evidence
 * at admission_criteria_en/admission_criteria instead.
 *
 * The compliance.req.<id>.supporting_evidence translation key already exists
 * from the prior backfill (wrong content) — update it in place rather than
 * insert, so it doesn't get flagged STALE for what is a data-source correction,
 * not an organic content change.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

async function main() {
  const [fw] = await sql`SELECT framework_id AS id FROM bayanat.gov_compliance_frameworks WHERE code = 'NAII'`;
  if (!fw) throw new Error("NAII framework not found");

  const updated = await sql`
    UPDATE bayanat.gov_compliance_requirements
    SET supporting_evidence_en = admission_criteria_en, supporting_evidence = admission_criteria
    WHERE framework_id = ${fw.id}
    RETURNING req_id, admission_criteria_en, admission_criteria
  `;
  console.log(`[NAII] repointed supporting evidence to admission criteria on ${updated.length} requirements`);

  let keysUpdated = 0, translationsUpdated = 0;
  for (const r of updated) {
    const baseText = (r.admission_criteria_en ?? "").trim();
    if (!baseText) continue;
    const keyCode = `compliance.req.${r.req_id}.supporting_evidence`;

    const [existing] = await sql`SELECT key_id AS "keyId" FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
    if (!existing) { console.log(`  ! missing key ${keyCode}, skipping`); continue; }
    const keyId = existing.keyId;

    await sql`UPDATE bayanat.translation_keys SET base_text = ${baseText} WHERE key_id = ${keyId}`;
    keysUpdated++;

    const arText = (r.admission_criteria ?? "").trim();
    if (arText && arText !== baseText) {
      const res = await sql`
        UPDATE bayanat.translations
        SET translated_text = ${arText}, status_code = 'VERIFIED', translated_at = now(), verified_at = now()
        WHERE key_id = ${keyId} AND language_code = 'ar'
      `;
      if (res.count > 0) translationsUpdated++;
      else {
        await sql`
          INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
          VALUES (${keyId}, 'ar', ${arText}, 'VERIFIED', now(), now())
        `;
        translationsUpdated++;
      }
    }
  }
  console.log(`  -> ${keysUpdated} translation keys updated, ${translationsUpdated} Arabic translations updated`);

  console.log("\n--- Verification ---");
  const [sample] = await sql`
    SELECT req_code, supporting_evidence_en FROM bayanat.gov_compliance_requirements
    WHERE framework_id = ${fw.id} ORDER BY req_id LIMIT 1
  `;
  console.log(sample);

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
