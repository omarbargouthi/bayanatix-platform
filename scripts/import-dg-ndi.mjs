/**
 * One-time import of DG NDI.xlsx into the compliance framework.
 * Replaces ALL requirements for framework NDI_2026 with the NDI spreadsheet data.
 * Run: node scripts/import-dg-ndi.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");

const XLSX_PATH = "C:\\Omar\\20240415\\Omar\\Personal\\Kenzcom\\Bayanatix files\\DG Files\\DG NDI.xlsx";

const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

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
  "evident administrator ":                           "evidentAdministrator",
  "evident administrator":                            "evidentAdministrator",
  "domain owner":                                     "domainOwner",
  "management and supporting sector (if applicable)": "managementSector",
  "submission status":                                "submissionStatus",
  "reviews":                                          "reviews",
};

function norm(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = COL_MAP[k.toLowerCase().trim()];
    if (mapped) out[mapped] = String(v ?? "").trim();
  }
  return out;
}

// Find or create the NDI_2026 framework
let [fw] = await sql`SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'NDI_2026'`;
if (!fw) {
  [fw] = await sql`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description)
    VALUES ('National Data Index 2026', 'NDI_2026', '2026', 'NDMO National Data Index compliance framework')
    RETURNING framework_id
  `;
  console.log("Created framework NDI_2026 id:", fw.framework_id);
}
const fwId = fw.framework_id;

// Delete existing requirements (cascades to assessments)
await sql`DELETE FROM bayanat.gov_compliance_requirements WHERE framework_id = ${fwId}`;
console.log("Cleared existing requirements for framework", fwId);

// Ensure level config exists
const levelDefaults = [
  { levelNum: 0, name: "No Capability", colorHex: "#D84848", description: "No defined data management practices. Activities are ad-hoc and undefined." },
  { levelNum: 1, name: "Build",         colorHex: "#E88030", description: "Initial data management practices being established." },
  { levelNum: 2, name: "Definition",    colorHex: "#2D4AA0", description: "Practices formally defined, documented and communicated." },
  { levelNum: 3, name: "Activation",    colorHex: "#3D7EC8", description: "Defined practices actively implemented across all teams." },
  { levelNum: 4, name: "Managed",       colorHex: "#1E8C76", description: "Practices measured and controlled using KPIs." },
  { levelNum: 5, name: "Innovation",    colorHex: "#5CA85C", description: "Continuous improvement — data management is a strategic differentiator." },
];
for (const l of levelDefaults) {
  await sql`
    INSERT INTO bayanat.gov_compliance_level_config
      (framework_id, level_num, name, color_hex, description)
    VALUES (${fwId}, ${l.levelNum}, ${l.name}, ${l.colorHex}, ${l.description})
    ON CONFLICT (framework_id, level_num) DO UPDATE SET
      name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, description = EXCLUDED.description
  `;
}

// Parse and insert rows
let inserted = 0;
for (let i = 0; i < rawRows.length; i++) {
  const n = norm(rawRows[i]);
  if (!n.question || n.question.length === 0) continue;

  const stdNum  = n.standardNumber ?? "";
  const dirCode = n.directoryCode  ?? "";
  const matLvl  = (n.maturityLevel ?? "").match(/(\d+)/)?.[1] ?? "X";

  // Use directory code as unique req_code; level-0 rows have N/A
  const reqCode = (dirCode && dirCode !== "N/A")
    ? dirCode
    : `${stdNum}-L${matLvl}`;

  await sql`
    INSERT INTO bayanat.gov_compliance_requirements
      (framework_id, req_code, standard, standard_code, req_text, domain, domain_code,
       maturity_level, supporting_evidence, admission_criteria, directory_code, directory_type,
       compliance_or_maturity, operational_excellence, evident_administrator,
       domain_owner, management_sector, sort_order)
    VALUES (
      ${fwId},
      ${reqCode},
      ${stdNum},
      ${stdNum},
      ${n.question},
      ${n.domain   || null},
      ${n.domainCode || null},
      ${n.maturityLevel || null},
      ${n.supportingEvidence || null},
      ${n.admissionCriteria  || null},
      ${dirCode || null},
      ${n.directoryType || null},
      ${n.complianceOrMaturity || null},
      ${n.operationalExcellence || null},
      ${n.evidentAdministrator || null},
      ${n.domainOwner || null},
      ${n.managementSector || null},
      ${i}
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

console.log(`✅  Imported ${inserted} DG NDI requirements into framework ${fwId}`);
await sql.end();
