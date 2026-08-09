/**
 * One-time import of PDPL, DCC, and CST as new compliance frameworks from
 * "PDPL, DCC & CST  Compliance.xlsx", grouped under KSA_REGULATIONS
 * (migration 078). Requirement definitions only — no compliance
 * status/score/comments/evidence from the source assessment is imported;
 * every organization using Bayanatix does its own real assessment.
 *
 * English is base (question_en/supporting_evidence_en/admission_criteria_en/
 * management_sector_en); req_text (NOT NULL) duplicates question_en since
 * there's no Arabic source yet — lib/i18n-admin/translatable-fields.ts's
 * sync guard skips seeding a "translation" when it's identical to the base,
 * so these show up as real Arabic coverage gaps, not false VERIFIED rows.
 *
 * domain/standard/maturity_level have no _en counterpart (native-only
 * fields) — populated directly in English since that's the only language
 * available; Arabic domain/standard labels can be added later per-framework
 * via gov_compliance_domain_config, same as NDI.
 *
 * Run: node scripts/import-ksa-regulations.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";
import * as XLSX from "xlsx";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

const XLSX_PATH = "C:\\Omar\\20240415\\Omar\\Personal\\Kenzcom\\Bayanatix files\\DG Files\\PDPL, DCC & CST  Compliance.xlsx";

const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });

function sheetRows(sheetName, headerRowIdx) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false });
  return rows.slice(headerRowIdx + 1).filter((r) => String(r[0] ?? "").trim() !== "");
}

async function upsertFramework(name, code, description) {
  await sql`DELETE FROM bayanat.gov_compliance_requirements WHERE framework_id IN (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = ${code})`;
  await sql`DELETE FROM bayanat.gov_compliance_frameworks WHERE code = ${code}`;
  const [fw] = await sql`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description, regulation_group_code, is_applicable_indicator)
    VALUES (${name}, ${code}, '1.0', ${description}, 'KSA_REGULATIONS', true)
    RETURNING framework_id
  `;
  return fw.framework_id;
}

async function seedSingleLevel(fwId) {
  await sql`
    INSERT INTO bayanat.gov_compliance_level_config (framework_id, level_num, name, color_hex, description)
    VALUES (${fwId}, 0, 'Requirement', '#2D4AA0', 'Every requirement in this framework — assessed individually, not against a maturity scale.')
    ON CONFLICT (framework_id, level_num) DO NOTHING
  `;
}

async function seedConfigItems(fwId) {
  const status = [
    { code: "COMPLETE", label: "Complete", labelAr: "مكتمل", color: "#10B981", sort: 1 },
    { code: "NOT_COMPLETE", label: "Not Completed", labelAr: "غير مكتمل", color: "#F59E0B", sort: 2 },
    { code: "NA", label: "N/A", labelAr: "لا ينطبق", color: "#6B7280", sort: 3 },
  ];
  for (const s of status) {
    await sql`
      INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
      VALUES (${fwId}, 'STATUS', ${s.code}, ${s.label}, ${s.labelAr}, ${s.color}, ${s.sort})
      ON CONFLICT (framework_id, config_group, code) DO NOTHING
    `;
  }
  await sql`
    INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
    VALUES (${fwId}, 'COMPLIANCE_TYPE', 'امتثال', 'Compliance', 'امتثال', '#2D4AA0', 1)
    ON CONFLICT (framework_id, config_group, code) DO NOTHING
  `;
}

async function insertRequirement(fwId, { reqCode, domain, standard, question, supportingEvidence, admissionCriteria, managementSector, sortOrder }) {
  const questionEn = question.trim();
  if (!questionEn) return false;
  await sql`
    INSERT INTO bayanat.gov_compliance_requirements
      (framework_id, req_code, standard, standard_code, req_text, domain, domain_code,
       maturity_level, compliance_or_maturity, sort_order,
       question_en, supporting_evidence_en, admission_criteria_en, management_sector_en)
    VALUES (
      ${fwId}, ${reqCode}, ${standard || null}, ${standard || null}, ${questionEn}, ${domain || null}, ${domain || null},
      '0', 'امتثال', ${sortOrder},
      ${questionEn}, ${supportingEvidence?.trim() || null}, ${admissionCriteria?.trim() || null}, ${managementSector?.trim() || null}
    )
  `;
  return true;
}

// ── PDPL ─────────────────────────────────────────────────────────────────
async function importPdpl(fwId) {
  const rows = sheetRows("PDPL+", 0).filter((r) => String(r[10] ?? "").trim() === "PDPL");
  let n = 0;
  for (const r of rows) {
    const ok = await insertRequirement(fwId, {
      reqCode: `PDPL-${r[0]}`, domain: r[1], standard: r[11],
      question: r[2], supportingEvidence: r[6], sortOrder: n,
    });
    if (ok) n++;
  }
  return n;
}

// ── DCC ──────────────────────────────────────────────────────────────────
async function importDcc(fwId) {
  const rows = sheetRows("DCC Assessment", 0);
  let n = 0;
  for (const r of rows) {
    const ok = await insertRequirement(fwId, {
      reqCode: `DCC-${r[0]}`, domain: r[1], standard: r[2],
      question: r[3], supportingEvidence: r[7], admissionCriteria: r[8], managementSector: r[9], sortOrder: n,
    });
    if (ok) n++;
  }
  return n;
}

// ── CST (dedicated sheet + the 4 unique CITC rows embedded in PDPL+) ──────
async function importCst(fwId) {
  let n = 0;
  const cstRows = sheetRows("CST ", 1);
  for (const r of cstRows) {
    const ok = await insertRequirement(fwId, {
      reqCode: `CST-${n + 1}`, domain: r[1], standard: r[2],
      question: r[3], supportingEvidence: r[7], sortOrder: n,
    });
    if (ok) n++;
  }
  const citcRows = sheetRows("PDPL+", 0).filter((r) => String(r[10] ?? "").trim().startsWith("CITC"));
  for (const r of citcRows) {
    const ok = await insertRequirement(fwId, {
      reqCode: `CST-${n + 1}`, domain: r[1], standard: r[11],
      question: r[2], supportingEvidence: r[6], sortOrder: n,
    });
    if (ok) n++;
  }
  return n;
}

const frameworks = [
  { name: "PDPL", code: "PDPL", description: "Personal Data Protection Law", importFn: importPdpl },
  { name: "DCC", code: "DCC", description: "Data Cybersecurity Controls", importFn: importDcc },
  { name: "CST", code: "CST", description: "Communications, Space & Technology Commission — Personal Data Protection Principles", importFn: importCst },
];

for (const f of frameworks) {
  const fwId = await upsertFramework(f.name, f.code, f.description);
  await seedSingleLevel(fwId);
  await seedConfigItems(fwId);
  const count = await f.importFn(fwId);
  console.log(`✅  ${f.name} (framework_id=${fwId}): ${count} requirements imported`);
}

await sql.end();
