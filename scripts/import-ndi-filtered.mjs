/**
 * Import all non-DG domains from "NDI 2026 - filtered.xlsx" into the NDI_2026 framework.
 * Row 1: Arabic headers (skipped). Row 2: English headers. Row 3+: data.
 * Run: node scripts/import-ndi-filtered.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";
import * as XLSX from "xlsx";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

const XLSX_PATH = "C:\\Omar\\20240415\\Omar\\Personal\\Kenzcom\\Bayanatix files\\DG Files\\NDI 2026 - filtered.xlsx";

const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];

// Get all rows as arrays (1-indexed in XLSX)
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

// Row index 0 = Arabic headers, Row index 1 = English headers, Row index 2+ = data
const headerRow = allRows[1].map((h) => String(h).toLowerCase().trim());

const COL_MAP = {
  "domain":                                           "domain",
  "domain code":                                      "domainCode",
  "standard number":                                  "standardNumber",
  "question":                                         "question",
  "maturity level":                                   "maturityLevel",
  "supporting evidence":                              "supportingEvidence",
  "admission criteria":                               "admissionCriteria",
  "directory code":                                   "directoryCode",
  "directory type":                                   "directoryType",
  "compliance or maturity?":                          "complianceOrMaturity",
  "operational excellence?":                          "operationalExcellence",
  "responsible for evidence":                         "evidentAdministrator",
  "evident administrator":                            "evidentAdministrator",
  "evident administrator ":                           "evidentAdministrator",
  "domain owner":                                     "domainOwner",
  "management and supporting sector (if applicable)": "managementSector",
  "submission status":                                "submissionStatus",
  "reviews":                                          "reviews",
};

// Find framework NDI_2026
let [fw] = await sql`SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'NDI_2026'`;
if (!fw) {
  [fw] = await sql`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description)
    VALUES ('National Data Index 2026', 'NDI_2026', '2026', 'NDMO National Data Index compliance framework')
    RETURNING framework_id
  `;
}
const fwId = fw.framework_id;

let inserted = 0;
let skipped = 0;

for (let i = 2; i < allRows.length; i++) {
  const rawRow = allRows[i];
  const n = {};
  headerRow.forEach((h, idx) => {
    const mapped = COL_MAP[h];
    if (mapped) n[mapped] = String(rawRow[idx] ?? "").trim();
  });

  if (!n.question || n.question.length === 0) continue;

  // Skip DG domain
  if (n.domainCode === "DG") { skipped++; continue; }

  const stdNum  = n.standardNumber ?? "";
  const dirCode = n.directoryCode  ?? "";
  const matNum  = (n.maturityLevel ?? "").match(/(\d+)/)?.[1] ?? "X";

  const reqCode = (dirCode && dirCode !== "N/A" && dirCode !== "N/A ")
    ? dirCode
    : `${stdNum}-L${matNum}-${i}`;

  await sql`
    INSERT INTO bayanat.gov_compliance_requirements
      (framework_id, req_code, standard, standard_code, req_text, domain, domain_code,
       maturity_level, supporting_evidence, admission_criteria, directory_code, directory_type,
       compliance_or_maturity, operational_excellence, evident_administrator,
       domain_owner, management_sector, sort_order)
    VALUES (
      ${fwId}, ${reqCode}, ${stdNum}, ${stdNum}, ${n.question},
      ${n.domain || null}, ${n.domainCode || null},
      ${n.maturityLevel || null}, ${n.supportingEvidence || null},
      ${n.admissionCriteria || null}, ${dirCode || null}, ${n.directoryType || null},
      ${n.complianceOrMaturity || null}, ${n.operationalExcellence || null},
      ${n.evidentAdministrator || null}, ${n.domainOwner || null},
      ${n.managementSector || null}, ${i}
    )
    ON CONFLICT (framework_id, req_code) DO UPDATE SET
      req_text               = EXCLUDED.req_text,
      maturity_level         = EXCLUDED.maturity_level,
      supporting_evidence    = EXCLUDED.supporting_evidence,
      admission_criteria     = EXCLUDED.admission_criteria,
      directory_type         = EXCLUDED.directory_type,
      compliance_or_maturity = EXCLUDED.compliance_or_maturity,
      evident_administrator  = EXCLUDED.evident_administrator,
      domain_owner           = EXCLUDED.domain_owner,
      management_sector      = EXCLUDED.management_sector,
      sort_order             = EXCLUDED.sort_order
  `;
  inserted++;
}

console.log(`✅  Imported ${inserted} requirements (skipped ${skipped} DG rows) into framework ${fwId}`);
await sql.end();
