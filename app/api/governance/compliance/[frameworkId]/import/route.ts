import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { importRequirements } from "@/lib/queries/gov-compliance";
import { createJob, updateJobProgress, finishJob, failJob } from "@/lib/queries/background-jobs";
import * as XLSX from "xlsx";

const JOB_TYPE_GOV_COMPLIANCE_IMPORT = "GOV_COMPLIANCE_IMPORT";

// Maps lowercased/trimmed header text → internal field name.
// Covers English headers (both English file and Arabic file's English sub-header row)
// plus Arabic headers (from Arabic file row 0).
const COL_MAP: Record<string, string> = {
  // ── Col A: Domain name ──────────────────────────────────────────────────────
  "domain":                                             "domain",
  "المجال":                                             "domain",

  // ── Col B: Domain code ──────────────────────────────────────────────────────
  "domain code":                                        "domainCode",
  "رمز المجال":                                         "domainCode",

  // ── Col C: Standard number (THIS is the standard, e.g. DSI.MQ.1) ──────────
  "standard number":                                    "standardNumber",
  "رقم المعيار":                                        "standardNumber",
  // legacy / alternate names kept for backward compat
  "standard":                                           "standard",
  "standard code":                                      "standardCode",
  "standard name":                                      "standard",

  // ── Col D: Question text ────────────────────────────────────────────────────
  "question":                                           "question",
  "السؤال":                                             "question",

  // ── Col E: Maturity level ───────────────────────────────────────────────────
  "maturity level":                                     "maturityLevel",
  "مستوى النضج":                                        "maturityLevel",

  // ── Col F: Supporting evidence ──────────────────────────────────────────────
  "supporting evidence":                                "supportingEvidence",
  "الأدلة الداعمة":                                     "supportingEvidence",

  // ── Col G: Admission criteria ───────────────────────────────────────────────
  "admission criteria":                                 "admissionCriteria",
  "معايير القبول":                                      "admissionCriteria",

  // ── Col H: Evidence / directory code (unique per evidence item) ─────────────
  "evidence code":                                      "directoryCode",   // English file header
  "directory code":                                     "directoryCode",   // Arabic file English sub-header
  "رمز الدليل":                                         "directoryCode",   // Arabic file Arabic header

  // ── Col I: Evidence / directory type ────────────────────────────────────────
  "evidence type":                                      "directoryType",
  "directory type":                                     "directoryType",
  "نوع الدليل":                                         "directoryType",

  // ── Col J: Compliance or maturity ───────────────────────────────────────────
  "compliance or maturity?":                            "complianceOrMaturity",
  "compliance or maturity":                             "complianceOrMaturity",
  "امتثال ام نضج؟":                                     "complianceOrMaturity",

  // ── Col K: Operational excellence ───────────────────────────────────────────
  "operational excellence?":                            "operationalExcellence",
  "operational excellence":                             "operationalExcellence",
  "تميز تشغيلي؟":                                       "operationalExcellence",

  // ── Col L: Responsible for evidence ─────────────────────────────────────────
  "responsible for evidence":                           "evidentAdministrator",
  "evident administrator":                              "evidentAdministrator",   // legacy name
  "المسؤول عن الدليل":                                  "evidentAdministrator",   // Arabic (trimmed)

  // ── Col M: Domain owner ─────────────────────────────────────────────────────
  "domain owner":                                       "domainOwner",
  "مالك المجال":                                        "domainOwner",

  // ── Col N: Management & supporting sector ───────────────────────────────────
  "management and supporting sector (if applicable)":   "managementSector",
  "management and supporting sector":                   "managementSector",
  "الإدارة والقطاع الداعم (أن وجد)":                    "managementSector",
};

type ImportRow = Parameters<typeof importRequirements>[1][number];

function parseWorkbook(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Read as raw array-of-arrays so we can handle dual-header Arabic files
  const rawSheet = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (rawSheet.length === 0) throw new Error("Empty sheet");

  const row0 = (rawSheet[0] ?? []) as string[];

  // Arabic file structure: row 0 = Arabic column headers, row 1 = English sub-headers, row 2+ = data.
  // English file structure: row 0 = English column headers, row 1+ = data.
  // Detect by checking whether row 0 contains Arabic characters.
  const isArabicFile = row0.some((h) => /[؀-ۿ]/.test(String(h)));

  const headerRow = isArabicFile ? (rawSheet[1] ?? []) as string[] : row0;
  const dataStart = isArabicFile ? 2 : 1;
  const dataRows = rawSheet.slice(dataStart) as string[][];
  if (dataRows.length === 0) throw new Error("No data rows found");

  const colToField: Record<number, string> = {};
  headerRow.forEach((h, i) => {
    const key = String(h ?? "").toLowerCase().trim();
    const field = COL_MAP[key];
    if (field) colToField[i] = field;
  });

  return dataRows.map((rawRow, idx) => {
    const norm: Record<string, string> = {};
    rawRow.forEach((val, colIdx) => {
      const field = colToField[colIdx];
      if (field) norm[field] = String(val ?? "").trim();
    });

    const stdNum = norm.standardNumber ?? norm.standard ?? "";
    const dirCode = norm.directoryCode ?? "";
    const rawLevel = norm.maturityLevel ?? "";
    const levelMatch = rawLevel.match(/(\d+)/);
    const levelNum = levelMatch ? levelMatch[1] : "";
    const reqCode = (dirCode && dirCode !== "N/A" && dirCode !== "")
      ? dirCode
      : `${stdNum || "REQ"}-L${levelNum || "X"}-${idx}`;

    return {
      reqCode,
      standard: stdNum,
      standardCode: stdNum,
      domain: norm.domain ?? "",
      domainCode: norm.domainCode ?? "",
      question: norm.question ?? "",
      maturityLevel: levelNum,
      supportingEvidence: norm.supportingEvidence ?? "",
      admissionCriteria: norm.admissionCriteria ?? "",
      directoryCode: dirCode,
      directoryType: norm.directoryType ?? "",
      complianceOrMaturity: norm.complianceOrMaturity ?? "",
      operationalExcellence: norm.operationalExcellence ?? "",
      evidentAdministrator: norm.evidentAdministrator ?? "",
      domainOwner: norm.domainOwner ?? "",
      managementSector: norm.managementSector ?? "",
      sortOrder: idx,
    };
  }).filter((r) =>
    r.question.length > 0 &&
    r.question.toLowerCase() !== "question" &&
    r.question !== "السؤال"
  );
}

async function runImport(jobId: number, frameworkId: number, buffer: Buffer): Promise<void> {
  try {
    const rows = parseWorkbook(buffer);
    await updateJobProgress(jobId, 0, rows.length);
    await importRequirements(frameworkId, rows);
    await updateJobProgress(jobId, rows.length, rows.length);

    const log = Buffer.from(`Imported ${rows.length} requirement row(s) into framework ${frameworkId} at ${new Date().toISOString()}\n`, "utf-8");
    await finishJob(jobId, { resultJson: { imported: rows.length }, logFileData: log });
  } catch (e) {
    await failJob(jobId, (e as Error).message);
  }
}

export async function POST(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const frameworkId = Number(params.frameworkId);
  const jobId = await createJob(JOB_TYPE_GOV_COMPLIANCE_IMPORT, { frameworkId, fileName: file.name }, session.userId);
  void runImport(jobId, frameworkId, buffer);

  return NextResponse.json({ jobId }, { status: 202 });
}
