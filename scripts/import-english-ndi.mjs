/**
 * Imports English content from "NDI 2026 - filtered (English).xlsx"
 * into the gov_compliance_requirements _en columns.
 *
 * Matching strategy:
 *   - Rows with Evidence Code != "N/A": match WHERE req_code = evCode
 *   - Level-0 rows (Evidence Code = "N/A"): match WHERE standard = std AND req_code LIKE '%-L0-%'
 */
import postgres from "postgres";
import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

// Load .env.local manually
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
try {
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const sql = postgres(process.env.DATABASE_URL, { max: 5, idle_timeout: 10 });

const EXCEL_PATH = "C:/Omar/20240415/Omar/Personal/Kenzcom/Bayanatix files/DG Files/NDI 2026 - filtered (English).xlsx";

const DOMAIN_MAP = {
  DSI: "Data Sharing and Integration Domain (DSI)",
  RMD: "Reference and Master Data Domain (RMD)",
  DG:  "Data Governance Domain",
  DQ:  "Data Quality Domain",
  BIA: "Business Intelligence and Analytics Domain (BIA)",
  DAM: "Data Architecture and Modelling Domain",
  MCM: "Metadata and Data Catalog Management Domain (MCM)",
  DVR: "Data Value Realisation Domain",
  OD:  "Open Data Domain",
  DC:  "Data Classification Domain",
  FOI: "Freedom of Information Domain",
  DO:  "Data Operations Domain",
  DCM: "Documents and Content Management Domain (DCM)",
  PDP: "Personal Data Protection Domain",
};

function clean(v) {
  if (v == null) return null;
  const s = String(v).replace(/\r\n/g, "\n").trim();
  return s === "" || s.toUpperCase() === "N/A" ? null : s;
}

async function main() {
  const wb = xlsx.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 }).slice(1);

  let updated = 0;
  let notFound = 0;

  for (const row of rows) {
    const domainCode = String(row[1] ?? "").trim();
    const std        = String(row[2] ?? "").trim();
    const questionEn = clean(row[3]);
    const evCode     = String(row[7] ?? "").trim();
    const dirTypeEn  = clean(row[8]);
    const suppEn     = clean(row[5]);
    const admCritEn  = clean(row[6]);
    const mgmtEn     = clean(row[13]);
    const domainEn   = DOMAIN_MAP[domainCode] ?? clean(row[0]);

    if (!std || !questionEn) continue;

    const isLevel0 = evCode === "" || evCode === "N/A";

    let result;
    if (isLevel0) {
      result = await sql`
        UPDATE bayanat.gov_compliance_requirements SET
          question_en            = ${questionEn},
          supporting_evidence_en = ${suppEn},
          admission_criteria_en  = ${admCritEn},
          management_sector_en   = ${mgmtEn},
          domain_en              = ${domainEn},
          directory_type_en      = ${dirTypeEn}
        WHERE standard = ${std} AND req_code LIKE '%-L0-%'
        RETURNING req_id
      `;
    } else {
      result = await sql`
        UPDATE bayanat.gov_compliance_requirements SET
          question_en            = ${questionEn},
          supporting_evidence_en = ${suppEn},
          admission_criteria_en  = ${admCritEn},
          management_sector_en   = ${mgmtEn},
          domain_en              = ${domainEn},
          directory_type_en      = ${dirTypeEn}
        WHERE req_code = ${evCode}
        RETURNING req_id
      `;
    }

    if (result.length > 0) {
      updated += result.length;
    } else {
      notFound++;
      if (process.env.VERBOSE) console.log(`NOT FOUND: std=${std} evCode=${evCode}`);
    }
  }

  console.log(`Done. Updated: ${updated} rows. Not matched: ${notFound} rows.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
