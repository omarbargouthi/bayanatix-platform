import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { importRequirements } from "@/lib/queries/gov-compliance";
import * as XLSX from "xlsx";

const COL_MAP: Record<string, string> = {
  "standard":                                          "standard",
  "standard code":                                     "standardCode",
  "standard name":                                     "standard",
  "domain":                                            "domain",
  "domain code":                                       "domainCode",
  "standard number":                                   "standardNumber",
  "question":                                          "question",
  "maturity level":                                    "maturityLevel",
  "supporting evidence":                               "supportingEvidence",
  "admission criteria":                                "admissionCriteria",
  "directory code":                                    "directoryCode",
  "directory type":                                    "directoryType",
  "compliance or maturity?":                           "complianceOrMaturity",
  "compliance or maturity":                            "complianceOrMaturity",
  "operational excellence?":                           "operationalExcellence",
  "operational excellence":                            "operationalExcellence",
  "evident administrator ":                            "evidentAdministrator",
  "evident administrator":                             "evidentAdministrator",
  "domain owner":                                      "domainOwner",
  "management and supporting sector (if applicable)":  "managementSector",
  "management and supporting sector":                  "managementSector",
};

export async function POST(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rawRows.length === 0) return NextResponse.json({ error: "Empty sheet" }, { status: 400 });

  const rows = rawRows.map((raw, i) => {
    const norm: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      const mapped = COL_MAP[key.toLowerCase().trim()];
      if (mapped) norm[mapped] = String(val ?? "").trim();
    }

    // Directory Code is the unique per-evidence-item identifier.
    // Standard Number (DG.MQ.1) is the grouping key stored in `standard`.
    const stdNum  = norm.standardNumber ?? norm.standard ?? "";
    const dirCode = norm.directoryCode  ?? "";
    const matNum  = (norm.maturityLevel ?? "").match(/(\d+)/)?.[1] ?? "X";
    const reqCode = (dirCode && dirCode !== "N/A")
      ? dirCode
      : `${stdNum || "REQ"}-L${matNum}-${i}`;

    return {
      reqCode,
      standard:              stdNum,
      standardCode:          stdNum,
      domain:                norm.domain                ?? "",
      domainCode:            norm.domainCode            ?? "",
      question:              norm.question              ?? "",
      maturityLevel:         norm.maturityLevel         ?? "",
      supportingEvidence:    norm.supportingEvidence    ?? "",
      admissionCriteria:     norm.admissionCriteria     ?? "",
      directoryCode:         dirCode,
      directoryType:         norm.directoryType         ?? "",
      complianceOrMaturity:  norm.complianceOrMaturity  ?? "",
      operationalExcellence: norm.operationalExcellence ?? "",
      evidentAdministrator:  norm.evidentAdministrator  ?? "",
      domainOwner:           norm.domainOwner           ?? "",
      managementSector:      norm.managementSector      ?? "",
      sortOrder:             i,
    };
  }).filter((r) => r.question.length > 0);

  await importRequirements(Number(params.frameworkId), rows);
  return NextResponse.json({ imported: rows.length });
}
