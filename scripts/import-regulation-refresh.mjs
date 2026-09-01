/**
 * Regulation Frameworks Refresh — imports 7 sheets from
 * "Regulation Frameworks Refresh - EN-AR v3.xlsx" into the live app DB:
 * DCC (full replace, official NCA source), BCBS239 (new), PDPL (full replace,
 * refreshed from the Mastersheet), NAII (new, real 0-5 maturity), QAYAS (new),
 * AI_ETHICS (new), NDI_REFRESH (in-place content refresh of the existing 518
 * NDI_2026 requirements — NOT a replace).
 *
 * Safety model: every requirement upsert goes through
 * ON CONFLICT (framework_id, req_code) DO UPDATE, which preserves req_id and
 * therefore compliance_workflow_deprecated/gov_compliance_assessments/gov_compliance_history
 * (all FK req_id ON DELETE CASCADE). DCC and PDPL end up as full replacements
 * anyway because their old and new req_code schemes don't overlap (DCC's
 * changed from flat DCC-N to hierarchical; PDPL's old/new numbering is
 * coincidental, not the same requirements) — the same upsert-then-delete-missing
 * mechanism handles that without a separate code path. NDI_2026's framework
 * row, level_config, and status config are never touched, only its requirement
 * rows are refreshed by req_code match.
 *
 * Run with DRY_RUN=1 first to review exactly what would be deleted before
 * committing to it:
 *   DRY_RUN=1 node scripts/import-regulation-refresh.mjs
 *   node scripts/import-regulation-refresh.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";
import * as XLSX from "xlsx";

const DRY_RUN = process.env.DRY_RUN === "1";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

const XLSX_PATH = "C:\\Omar\\20240415\\Omar\\Personal\\Kenzcom\\Bayanatix files\\DG Files\\Regulation\\Regulation Frameworks Refresh - EN-AR v3.xlsx";
const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });

function sheetRows(sheetName) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false });
  return rows.slice(1).filter((r) => String(r[0] ?? "").trim() !== "");
}
const trim = (v) => (v == null ? null : String(v).trim() || null);

// ── Frameworks / level config / status config ───────────────────────────────

async function upsertFramework({ name, code, description, groupCode, assessmentMode }) {
  const [fw] = await sql`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description, regulation_group_code, is_applicable_indicator, assessment_mode)
    VALUES (${name}, ${code}, '1.0', ${description}, ${groupCode}, true, ${assessmentMode})
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description,
      regulation_group_code = EXCLUDED.regulation_group_code, assessment_mode = EXCLUDED.assessment_mode
    RETURNING framework_id
  `;
  return fw.framework_id;
}

async function seedComplianceOnlyLevel(fwId) {
  await sql`
    INSERT INTO bayanat.gov_compliance_level_config (framework_id, level_num, name, color_hex, description, name_ar)
    VALUES (${fwId}, 0, 'Requirement', '#2D4AA0', 'Every requirement in this framework — assessed individually, not against a maturity scale.', 'متطلب')
    ON CONFLICT (framework_id, level_num) DO UPDATE SET name_ar = EXCLUDED.name_ar
  `;
}

async function seedNaiiMaturityLevels(fwId) {
  const [ndi] = await sql`SELECT framework_id AS id FROM bayanat.gov_compliance_frameworks WHERE code = 'NDI_2026'`;
  const levels = await sql`
    SELECT level_num, name, color_hex, name_ar FROM bayanat.gov_compliance_level_config WHERE framework_id = ${ndi.id} ORDER BY level_num
  `;
  for (const l of levels) {
    await sql`
      INSERT INTO bayanat.gov_compliance_level_config (framework_id, level_num, name, color_hex, name_ar)
      VALUES (${fwId}, ${l.level_num}, ${l.name}, ${l.color_hex}, ${l.name_ar})
      ON CONFLICT (framework_id, level_num) DO UPDATE SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, name_ar = EXCLUDED.name_ar
    `;
  }
}

const STATUS_COMPLIANCE_ONLY = [
  { code: "COMPLIANCE", label: "Compliance", labelAr: "امتثال", color: "#10B981", sort: 1 },
  { code: "PARTIAL_COMPLIANCE", label: "Partial Compliance", labelAr: "امتثال جزئي", color: "#F59E0B", sort: 2 },
  { code: "NON_COMPLIANCE", label: "Non Compliance", labelAr: "عدم الامتثال", color: "#EF4444", sort: 3 },
  { code: "NA", label: "N/A", labelAr: "لا ينطبق", color: "#6B7280", sort: 4 },
];
const STATUS_MATURITY = [
  { code: "COMPLETE", label: "Complete", labelAr: "مكتمل", color: "#10B981", sort: 1 },
  { code: "NOT_COMPLETE", label: "Not Completed", labelAr: "غير مكتمل", color: "#F59E0B", sort: 2 },
  { code: "NA", label: "N/A", labelAr: "لا ينطبق", color: "#6B7280", sort: 3 },
];
async function seedStatusConfig(fwId, mode) {
  const statuses = mode === "MATURITY" ? STATUS_MATURITY : STATUS_COMPLIANCE_ONLY;
  for (const s of statuses) {
    await sql`
      INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
      VALUES (${fwId}, 'STATUS', ${s.code}, ${s.label}, ${s.labelAr}, ${s.color}, ${s.sort})
      ON CONFLICT (framework_id, config_group, code) DO UPDATE SET label = EXCLUDED.label, label_ar = EXCLUDED.label_ar, color_hex = EXCLUDED.color_hex
    `;
  }
  await sql`
    INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
    VALUES (${fwId}, 'COMPLIANCE_TYPE', 'امتثال', 'Compliance', 'امتثال', '#2D4AA0', 1)
    ON CONFLICT (framework_id, config_group, code) DO NOTHING
  `;
  if (mode === "MATURITY") {
    await sql`
      INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
      VALUES (${fwId}, 'COMPLIANCE_TYPE', 'نضج', 'Maturity', 'نضج', '#5CA85C', 2)
      ON CONFLICT (framework_id, config_group, code) DO NOTHING
    `;
  }
}

async function upsertDomainConfig(fwId, domainCode, nameEn, nameAr, sortOrder) {
  if (!domainCode) return;
  await sql`
    INSERT INTO bayanat.gov_compliance_domain_config (framework_id, domain_code, name_en, name_ar, sort_order)
    VALUES (${fwId}, ${domainCode}, ${nameEn}, ${nameAr}, ${sortOrder})
    ON CONFLICT (framework_id, domain_code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar
  `;
}

// ── Requirement upsert ───────────────────────────────────────────────────────

async function upsertRequirement(fwId, r) {
  const questionEn = trim(r.questionEn);
  if (!questionEn) return null;
  const [row] = await sql`
    INSERT INTO bayanat.gov_compliance_requirements
      (framework_id, req_code, standard, standard_code, standard_ar, req_text, domain, domain_code, domain_en,
       maturity_level, compliance_or_maturity, sort_order,
       question_en, admission_criteria_en, admission_criteria, supporting_evidence_en, supporting_evidence,
       operational_excellence)
    VALUES (
      ${fwId}, ${r.reqCode}, ${trim(r.standardEn)}, ${trim(r.standardEn)}, ${trim(r.standardAr)},
      ${trim(r.requirementAr) || questionEn}, ${trim(r.domainAr) || trim(r.domainEn)}, ${trim(r.domainEn)}, ${trim(r.domainEn)},
      ${r.maturityLevel ?? "0"}, ${r.complianceOrMaturity}, ${r.sortOrder},
      ${questionEn}, ${trim(r.admissionCriteriaEn)}, ${trim(r.admissionCriteriaAr)},
      ${trim(r.supportingEvidenceEn) ?? null}, ${trim(r.supportingEvidenceAr) ?? null},
      ${trim(r.operationalExcellence) ?? null}
    )
    ON CONFLICT (framework_id, req_code) DO UPDATE SET
      standard = EXCLUDED.standard, standard_code = EXCLUDED.standard_code, standard_ar = EXCLUDED.standard_ar,
      req_text = EXCLUDED.req_text, domain = EXCLUDED.domain, domain_code = EXCLUDED.domain_code, domain_en = EXCLUDED.domain_en,
      maturity_level = EXCLUDED.maturity_level, sort_order = EXCLUDED.sort_order,
      question_en = EXCLUDED.question_en, admission_criteria_en = EXCLUDED.admission_criteria_en, admission_criteria = EXCLUDED.admission_criteria,
      supporting_evidence_en = EXCLUDED.supporting_evidence_en, supporting_evidence = EXCLUDED.supporting_evidence,
      operational_excellence = EXCLUDED.operational_excellence
    RETURNING req_id
  `;
  return row.req_id;
}

// ── Translation-key registration (scoped reimplementation of upsertKey()) ───

async function upsertTranslationKey(categoryCode, keyCode, baseText, secondaryLang, rawSecondary, contextNote) {
  if (!baseText) return null;
  const [existing] = await sql`SELECT key_id AS "keyId", base_text AS "baseText" FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
  let keyId;
  if (!existing) {
    const [inserted] = await sql`
      INSERT INTO bayanat.translation_keys (category_code, key_code, base_text, base_language_code, context_note_text)
      VALUES (${categoryCode}, ${keyCode}, ${baseText}, 'en', ${contextNote ?? null})
      RETURNING key_id AS "keyId"
    `;
    keyId = inserted.keyId;
  } else {
    keyId = existing.keyId;
    const updates = { base_text: existing.baseText !== baseText ? baseText : undefined };
    if (existing.baseText !== baseText) {
      await sql`UPDATE bayanat.translation_keys SET base_text = ${baseText}, context_note_text = ${contextNote ?? null} WHERE key_id = ${keyId}`;
      await sql`UPDATE bayanat.translations SET status_code = 'STALE' WHERE key_id = ${keyId} AND status_code <> 'MISSING'`;
    } else if (contextNote) {
      await sql`UPDATE bayanat.translation_keys SET context_note_text = ${contextNote} WHERE key_id = ${keyId}`;
    }
  }

  const secondary = rawSecondary && String(rawSecondary).trim() && String(rawSecondary).trim() !== baseText ? String(rawSecondary).trim() : null;
  if (secondary) {
    await sql`
      INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
      VALUES (${keyId}, ${secondaryLang}, ${secondary}, 'VERIFIED', now(), now())
      ON CONFLICT (key_id, language_code) DO NOTHING
    `;
  }
  return keyId;
}

async function registerRequirementTranslations(reqId, r, contextNote, { includeStandardKey = true } = {}) {
  const keyIds = [];
  const fields = [
    ["question", r.questionEn, r.requirementAr],
    ["admission_criteria", r.admissionCriteriaEn, r.admissionCriteriaAr],
    ["supporting_evidence", r.supportingEvidenceEn, r.supportingEvidenceAr],
    // NDI's "standard" is a bare technical code (e.g. "DSI.MQ.2") that's the
    // same string in both languages, not real bilingual prose like DCC/PDPL's
    // — tracking it as a translation key just creates permanent MISSING debt
    // for something that will never have a meaningful Arabic translation.
    ...(includeStandardKey ? [["standard", r.standardEn, r.standardAr]] : []),
  ];
  for (const [suffix, en, ar] of fields) {
    const baseText = trim(en);
    if (!baseText) continue;
    const keyId = await upsertTranslationKey("COMPLIANCE_REQUIREMENTS", `compliance.req.${reqId}.${suffix}`, baseText, "ar", ar, contextNote);
    if (keyId) keyIds.push(keyId);
  }
  return keyIds;
}

async function registerDomainTranslation(fwId, domainCode, nameEn, nameAr) {
  if (!domainCode || !trim(nameEn)) return;
  await upsertTranslationKey("LIST_COMPLIANCE_DOMAINS", `list.compliance_domains.${fwId}.${domainCode}.name`, trim(nameEn), "ar", nameAr, null);
}

const AI_TRANSLATED_CONTEXT_NOTE =
  "Base English text was AI-translated from the authoritative Arabic source — recommend a human review pass.";

// Deleting a requirement row doesn't cascade to its translation_keys (they're
// keyed by req_id embedded in a text key_code, no real FK) — clean those up
// explicitly so deleted requirements don't leave permanent MISSING-Arabic
// debt sitting in the Language Management coverage denominator forever.
async function deleteOrphanedTranslationKeys(reqIds) {
  if (reqIds.length === 0) return;
  const suffixes = ["question", "admission_criteria", "supporting_evidence", "management_sector", "standard"];
  const keyCodes = reqIds.flatMap((id) => suffixes.map((s) => `compliance.req.${id}.${s}`));
  await sql`DELETE FROM bayanat.translation_keys WHERE key_code = ANY(${keyCodes})`;
}

// ── Full replace (PDPL, DCC): old and new req_code schemes only coincidentally
// overlap (both happen to number sequentially from 1, but from unrelated
// sources) — upserting by code would silently attach unrelated new content to
// old req_ids, corrupting whatever assessment/workflow history pointed at
// them. Delete everything for the framework FIRST, then insert fresh, so
// there's nothing left to falsely match against. ─────────────────────────────

async function reportAndDeleteAll(fwId, frameworkCode) {
  const existing = await sql`SELECT req_id, req_code FROM bayanat.gov_compliance_requirements WHERE framework_id = ${fwId}`;
  if (existing.length === 0) { console.log(`  [${frameworkCode}] no existing rows to clear`); return; }
  const reqIds = existing.map((r) => r.req_id);
  const [{ assessedCount }] = await sql`SELECT count(*)::int AS "assessedCount" FROM bayanat.gov_compliance_assessments WHERE req_id = ANY(${reqIds})`;
  const [{ workflowCount }] = await sql`SELECT count(*)::int AS "workflowCount" FROM bayanat.compliance_workflow_deprecated WHERE req_id = ANY(${reqIds})`;

  console.log(`\n  ⚠️  [${frameworkCode}] full replace: clearing all ${existing.length} existing requirement(s) before inserting the refreshed set`);
  console.log(`      (old/new req_code numbering only coincidentally overlaps — upserting by code would silently corrupt, not preserve, this data)`);
  console.log(`      ${assessedCount} have a gov_compliance_assessments row, ${workflowCount} have a compliance_workflow_deprecated row (both cascade-delete with them).`);
  for (const r of existing.slice(0, 10)) console.log(`      - req_id=${r.req_id}  req_code=${r.req_code}`);
  if (existing.length > 10) console.log(`      ... and ${existing.length - 10} more`);

  if (DRY_RUN) { console.log("      DRY_RUN=1 — not deleting."); return; }
  await sql`DELETE FROM bayanat.gov_compliance_requirements WHERE req_id = ANY(${reqIds})`;
  await deleteOrphanedTranslationKeys(reqIds);
  console.log("      Cleared.");
}

// ── Delete-if-missing (run after all upserts for a framework) ───────────────

async function reportAndDeleteMissing(fwId, frameworkCode, seenCodes) {
  const existing = await sql`SELECT req_id, req_code FROM bayanat.gov_compliance_requirements WHERE framework_id = ${fwId}`;
  const toDelete = existing.filter((r) => !seenCodes.has(r.req_code));
  if (toDelete.length === 0) {
    console.log(`  [${frameworkCode}] nothing to delete (${existing.length} existing, all matched)`);
    return;
  }
  const reqIds = toDelete.map((r) => r.req_id);
  const [{ assessedCount }] = await sql`SELECT count(*)::int AS "assessedCount" FROM bayanat.gov_compliance_assessments WHERE req_id = ANY(${reqIds})`;
  const [{ workflowCount }] = await sql`SELECT count(*)::int AS "workflowCount" FROM bayanat.compliance_workflow_deprecated WHERE req_id = ANY(${reqIds})`;

  console.log(`\n  \u26a0\ufe0f  [${frameworkCode}] ${toDelete.length} requirement(s) not present in the new source — will be deleted:`);
  console.log(`      ${assessedCount} have a gov_compliance_assessments row, ${workflowCount} have a compliance_workflow_deprecated row (both cascade-delete with them).`);
  for (const r of toDelete.slice(0, 20)) console.log(`      - req_id=${r.req_id}  req_code=${r.req_code}`);
  if (toDelete.length > 20) console.log(`      ... and ${toDelete.length - 20} more`);

  if (DRY_RUN) {
    console.log("      DRY_RUN=1 — not deleting.");
    return;
  }
  await sql`DELETE FROM bayanat.gov_compliance_requirements WHERE req_id = ANY(${reqIds})`;
  await deleteOrphanedTranslationKeys(reqIds);
  console.log("      Deleted.");
}

// ── Column indices ───────────────────────────────────────────────────────────
// Simple sheets: req_code|domain_en|domain_ar|standard_en|standard_ar|requirement_en|requirement_ar|admission_criteria_en|admission_criteria_ar|sort_order|source_notes
// NDI_REFRESH:   req_code|maturity_level|domain_en|domain_ar|standard_en|standard_ar|requirement_en|requirement_ar|admission_criteria_en|admission_criteria_ar|supporting_evidence_en|supporting_evidence_ar|operational_excellence_en|operational_excellence_ar|sort_order|change_type|source_notes

async function importSimpleSheet(sheetName, fwId, frameworkCode, complianceOrMaturity, { parseNaiiLevel = false, contextNote = null, fullReplace = false } = {}) {
  if (fullReplace) await reportAndDeleteAll(fwId, frameworkCode);
  const rows = sheetRows(sheetName);
  const seenCodes = new Set();
  const domainSeen = new Map();
  let sortOrder = 0;
  let keyIdCount = 0;

  for (const row of rows) {
    const [reqCode, domainEn, domainAr, standardEn, standardAr, requirementEn, requirementAr, admEn, admAr] = row;
    if (!reqCode) continue;
    let maturityLevel = "0";
    if (parseNaiiLevel) {
      const m = String(reqCode).match(/-L(\d)$/);
      maturityLevel = m ? m[1] : "0";
    }
    const reqId = await upsertRequirement(fwId, {
      reqCode: String(reqCode).trim(), domainEn, domainAr, standardEn, standardAr,
      questionEn: requirementEn, requirementAr, admissionCriteriaEn: admEn, admissionCriteriaAr: admAr,
      sortOrder: sortOrder++, maturityLevel, complianceOrMaturity,
    });
    if (!reqId) continue;
    seenCodes.add(String(reqCode).trim());
    const keyIds = await registerRequirementTranslations(reqId, { questionEn: requirementEn, requirementAr, admissionCriteriaEn: admEn, admissionCriteriaAr: admAr, standardEn, standardAr }, contextNote);
    keyIdCount += keyIds.length;

    const domainKey = (domainEn || "").trim();
    if (domainKey && !domainSeen.has(domainKey)) domainSeen.set(domainKey, { domainAr, sortOrder: domainSeen.size });
  }

  for (const [domainEn, { domainAr, sortOrder: dSort }] of domainSeen) {
    await upsertDomainConfig(fwId, domainEn, domainEn, domainAr, dSort);
    await registerDomainTranslation(fwId, domainEn, domainEn, domainAr);
  }

  console.log(`  [${frameworkCode}] upserted ${seenCodes.size} requirements, ${domainSeen.size} domains, ${keyIdCount} translation keys touched`);
  // fullReplace already cleared everything before this loop ran, so there's
  // nothing left to diff against — skip the delete-missing pass entirely
  // (running it would be a correctness no-op, but also pointless work).
  if (!fullReplace) await reportAndDeleteMissing(fwId, frameworkCode, seenCodes);
  return seenCodes;
}

// ── NDI_REFRESH ───────────────────────────────────────────────────────────

async function importNdiRefresh() {
  const [ndi] = await sql`SELECT framework_id AS id FROM bayanat.gov_compliance_frameworks WHERE code = 'NDI_2026'`;
  const fwId = ndi.id;
  const rows = sheetRows("NDI_REFRESH");
  const seenCodes = new Set();
  const domainSeen = new Map();
  let sortOrder = 0;
  let skippedOE = 0, skippedAlt = 0, upserted = 0;

  for (const row of rows) {
    const [reqCode, maturityLevel, domainEn, domainAr, standardEn, standardAr, requirementEn, requirementAr,
      admEn, admAr, evEn, evAr, opsExEn, opsExAr, , changeType] = row;
    if (!reqCode) continue;
    const code = String(reqCode).trim();
    if (/\.OE\.\d+$/.test(code)) { skippedOE++; continue; }
    if (code.includes("-ALT")) { skippedAlt++; continue; }

    const reqId = await upsertRequirement(fwId, {
      reqCode: code, domainEn, domainAr, standardEn, standardAr,
      questionEn: requirementEn, requirementAr, admissionCriteriaEn: admEn, admissionCriteriaAr: admAr,
      supportingEvidenceEn: evEn, supportingEvidenceAr: evAr, operationalExcellence: opsExAr || opsExEn,
      sortOrder: sortOrder++, maturityLevel: trim(maturityLevel) ?? "0", complianceOrMaturity: "نضج",
    });
    if (!reqId) continue;
    seenCodes.add(code);
    upserted++;

    // Only flag a review context-note on rows the diff actually classified as
    // NEW/CHANGED (i.e. this run's AI-translated content) — UNCHANGED rows keep
    // whatever context/status they already had, no need to touch them.
    const note = changeType && String(changeType).trim() !== "UNCHANGED" ? AI_TRANSLATED_CONTEXT_NOTE : null;
    await registerRequirementTranslations(reqId, {
      questionEn: requirementEn, requirementAr, admissionCriteriaEn: admEn, admissionCriteriaAr: admAr,
      standardEn, standardAr, supportingEvidenceEn: evEn, supportingEvidenceAr: evAr,
    }, note, { includeStandardKey: false });

    const domainKey = (domainEn || "").trim();
    if (domainKey && !domainSeen.has(domainKey)) domainSeen.set(domainKey, { domainAr, sortOrder: domainSeen.size });
  }

  for (const [domainEn, { domainAr, sortOrder: dSort }] of domainSeen) {
    await upsertDomainConfig(fwId, domainEn, domainEn, domainAr, dSort);
    await registerDomainTranslation(fwId, domainEn, domainEn, domainAr);
  }

  console.log(`  [NDI_2026] upserted ${upserted} requirements (skipped ${skippedOE} Ops-Exc, ${skippedAlt} -ALT placeholder rows), ${domainSeen.size} domains`);
  await reportAndDeleteMissing(fwId, "NDI_2026", seenCodes);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Regulation Frameworks Refresh import — ${DRY_RUN ? "DRY RUN" : "LIVE RUN"}\n`);

  const bcbsFwId = await upsertFramework({ name: "BCBS 239", code: "BCBS239", description: "Principles for Effective Risk Data Aggregation and Risk Reporting (Basel Committee)", groupCode: "INTERNATIONAL_STANDARDS", assessmentMode: "COMPLIANCE_ONLY" });
  await seedComplianceOnlyLevel(bcbsFwId);
  await seedStatusConfig(bcbsFwId, "COMPLIANCE_ONLY");

  const dccFwId = await upsertFramework({ name: "DCC", code: "DCC", description: "Data Cybersecurity Controls (DCC-1:2022) — National Cybersecurity Authority", groupCode: "KSA_REGULATIONS", assessmentMode: "COMPLIANCE_ONLY" });
  await seedComplianceOnlyLevel(dccFwId);
  await seedStatusConfig(dccFwId, "COMPLIANCE_ONLY");

  const pdplFwId = await upsertFramework({ name: "PDPL", code: "PDPL", description: "Personal Data Protection Law", groupCode: "KSA_REGULATIONS", assessmentMode: "COMPLIANCE_ONLY" });
  await seedComplianceOnlyLevel(pdplFwId);
  await seedStatusConfig(pdplFwId, "COMPLIANCE_ONLY");

  const naiiFwId = await upsertFramework({ name: "NAII", code: "NAII", description: "National AI Index", groupCode: "KSA_REGULATIONS", assessmentMode: "MATURITY" });
  await seedNaiiMaturityLevels(naiiFwId);
  await seedStatusConfig(naiiFwId, "MATURITY");

  const qayasFwId = await upsertFramework({ name: "QAYAS", code: "QAYAS", description: "Qayas — Data Governance and Management Assessment", groupCode: "KSA_REGULATIONS", assessmentMode: "COMPLIANCE_ONLY" });
  await seedComplianceOnlyLevel(qayasFwId);
  await seedStatusConfig(qayasFwId, "COMPLIANCE_ONLY");

  const aiEthicsFwId = await upsertFramework({ name: "AI Ethics", code: "AI_ETHICS", description: "AI Ethics Compliance Framework", groupCode: "KSA_REGULATIONS", assessmentMode: "COMPLIANCE_ONLY" });
  await seedComplianceOnlyLevel(aiEthicsFwId);
  await seedStatusConfig(aiEthicsFwId, "COMPLIANCE_ONLY");

  console.log("Importing DCC (full replace)...");
  await importSimpleSheet("DCC", dccFwId, "DCC", "امتثال", { fullReplace: true });

  console.log("Importing BCBS239 (new)...");
  await importSimpleSheet("BCBS239", bcbsFwId, "BCBS239", "امتثال", { contextNote: null }); // en is genuinely official base here

  console.log("Importing PDPL (full replace)...");
  await importSimpleSheet("PDPL", pdplFwId, "PDPL", "امتثال", { contextNote: AI_TRANSLATED_CONTEXT_NOTE, fullReplace: true });

  console.log("Importing NAII (new, real maturity levels)...");
  await importSimpleSheet("NAII", naiiFwId, "NAII", "نضج", { parseNaiiLevel: true, contextNote: AI_TRANSLATED_CONTEXT_NOTE });

  console.log("Importing QAYAS (new)...");
  await importSimpleSheet("QAYAS", qayasFwId, "QAYAS", "امتثال", { contextNote: AI_TRANSLATED_CONTEXT_NOTE });

  console.log("Importing AI_ETHICS (new)...");
  await importSimpleSheet("AI_ETHICS", aiEthicsFwId, "AI_ETHICS", "امتثال", { contextNote: AI_TRANSLATED_CONTEXT_NOTE });

  console.log("Refreshing NDI_2026 requirement content (in-place, no framework/level changes)...");
  await importNdiRefresh();

  // BCBS239's Arabic is genuinely AI-translated from an official-English-only
  // source (the reverse situation from PDPL/NAII/QAYAS/AI_ETHICS, where Arabic
  // is native and English is the AI output) — downgrade its freshly-seeded
  // Arabic translations from the auto-VERIFIED the seeding step assigns.
  if (!DRY_RUN) {
    const { count } = (await sql`
      UPDATE bayanat.translations t SET status_code = 'AI_TRANSLATED'
      FROM bayanat.translation_keys tk, bayanat.gov_compliance_requirements r
      WHERE t.key_id = tk.key_id
        AND tk.key_code = 'compliance.req.' || r.req_id::text || substring(tk.key_code from '\\.[a-z_]+$')
        AND r.framework_id = ${bcbsFwId} AND t.language_code = 'ar' AND t.status_code = 'VERIFIED'
    `)[0] ?? { count: 0 };
    console.log(`\nDowngraded BCBS239 Arabic translations to AI_TRANSLATED.`);
  }

  // Defensive orphan check — collab_asset_refs has no FK to req_id.
  const orphans = await sql`
    SELECT car.asset_id FROM bayanat.collab_asset_refs car
    WHERE car.asset_type = 'COMPLIANCE_EVIDENCE'
      AND NOT EXISTS (SELECT 1 FROM bayanat.gov_compliance_requirements r WHERE r.req_id::text = car.asset_id)
  `;
  if (orphans.length) {
    console.log(`\n  \u26a0\ufe0f  ${orphans.length} collab_asset_refs now point at a deleted req_id: ${orphans.map((o) => o.asset_id).join(", ")}`);
  } else {
    console.log("\nNo orphaned collaboration references found.");
  }

  console.log("\n--- Summary ---");
  const counts = await sql`
    SELECT f.code, count(r.req_id)::int AS n FROM bayanat.gov_compliance_frameworks f
    LEFT JOIN bayanat.gov_compliance_requirements r ON r.framework_id = f.framework_id
    GROUP BY f.code ORDER BY f.code
  `;
  for (const c of counts) console.log(`  ${c.code}: ${c.n} requirements`);

  const protectedWorkflow = await sql`
    SELECT r.req_id, r.req_code, w.status FROM bayanat.compliance_workflow_deprecated w
    JOIN bayanat.gov_compliance_requirements r USING (req_id) ORDER BY r.req_code
  `;
  console.log(`\n  NDI compliance_workflow_deprecated rows after import (expect 5, same req_ids as before):`);
  for (const w of protectedWorkflow) console.log(`    req_id=${w.req_id} req_code=${w.req_code} status=${w.status}`);

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
