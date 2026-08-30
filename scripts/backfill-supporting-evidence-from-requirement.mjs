/**
 * Sets supporting_evidence_en/supporting_evidence = question_en/req_text (i.e. the
 * "Requirement" column from the source workbook) for DCC, BCBS239, PDPL, NAII,
 * QAYAS — these 5 frameworks' import (scripts/import-regulation-refresh.mjs,
 * importSimpleSheet) never populated supporting evidence at all, unlike NDI which
 * has its own dedicated Supporting Evidence column in the source sheet.
 *
 * Registers the new compliance.req.<id>.supporting_evidence translation key with
 * the exact same base-language/context-note/status convention already used for
 * that same requirement's .question key (verified per-framework beforehand):
 *   - DCC:               no context note, ar VERIFIED  (officially bilingual)
 *   - BCBS239:            no context note, ar AI_TRANSLATED (en is official base)
 *   - PDPL/NAII/QAYAS:    AI_TRANSLATED_CONTEXT_NOTE on en, ar VERIFIED (ar is native)
 *
 * Idempotent: ON CONFLICT (key_code) leaves an existing key's translation alone.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

const AI_TRANSLATED_CONTEXT_NOTE =
  "Base English text was AI-translated from the authoritative Arabic source — recommend a human review pass.";

const FRAMEWORKS = [
  { code: "DCC", contextNote: null, arStatus: "VERIFIED" },
  { code: "BCBS239", contextNote: null, arStatus: "AI_TRANSLATED" },
  { code: "PDPL", contextNote: AI_TRANSLATED_CONTEXT_NOTE, arStatus: "VERIFIED" },
  { code: "NAII", contextNote: AI_TRANSLATED_CONTEXT_NOTE, arStatus: "VERIFIED" },
  { code: "QAYAS", contextNote: AI_TRANSLATED_CONTEXT_NOTE, arStatus: "VERIFIED" },
];

async function main() {
  for (const { code, contextNote, arStatus } of FRAMEWORKS) {
    const [fw] = await sql`SELECT framework_id AS id FROM bayanat.gov_compliance_frameworks WHERE code = ${code}`;
    if (!fw) { console.log(`[${code}] framework not found, skipping`); continue; }

    const updated = await sql`
      UPDATE bayanat.gov_compliance_requirements
      SET supporting_evidence_en = question_en, supporting_evidence = req_text
      WHERE framework_id = ${fw.id}
      RETURNING req_id, question_en, req_text
    `;
    console.log(`[${code}] backfilled supporting evidence on ${updated.length} requirements`);

    let created = 0, seeded = 0;
    for (const r of updated) {
      const baseText = (r.question_en ?? "").trim();
      if (!baseText) continue;
      const keyCode = `compliance.req.${r.req_id}.supporting_evidence`;

      const [existing] = await sql`SELECT key_id AS "keyId" FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
      let keyId;
      if (!existing) {
        const [inserted] = await sql`
          INSERT INTO bayanat.translation_keys (category_code, key_code, base_text, base_language_code, context_note_text)
          VALUES ('COMPLIANCE_REQUIREMENTS', ${keyCode}, ${baseText}, 'en', ${contextNote})
          RETURNING key_id AS "keyId"
        `;
        keyId = inserted.keyId;
        created++;
      } else {
        keyId = existing.keyId;
      }

      const arText = (r.req_text ?? "").trim();
      if (arText && arText !== baseText) {
        const inserted = await sql`
          INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
          VALUES (${keyId}, 'ar', ${arText}, ${arStatus}, now(), now())
          ON CONFLICT (key_id, language_code) DO NOTHING
          RETURNING translation_id
        `;
        if (inserted.length > 0) seeded++;
      }
    }
    console.log(`  -> ${created} translation keys created, ${seeded} Arabic translations seeded (${arStatus})`);
  }

  console.log("\n--- Verification ---");
  const check = await sql`
    SELECT f.code, count(*) total,
      count(*) FILTER (WHERE r.supporting_evidence_en IS NOT NULL AND trim(r.supporting_evidence_en) <> '') AS has_ev_en
    FROM bayanat.gov_compliance_requirements r
    JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = r.framework_id
    WHERE f.code IN ('DCC','BCBS239','PDPL','NAII','QAYAS')
    GROUP BY f.code ORDER BY f.code
  `;
  for (const c of check) console.log(`  ${c.code}: ${c.has_ev_en}/${c.total} have supporting_evidence_en`);

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
