import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRequirements, getFramework } from "@/lib/queries/gov-compliance";
import * as XLSX from "xlsx";

export async function GET(_req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fwId = Number(params.frameworkId);
  const [framework, requirements] = await Promise.all([getFramework(fwId), listRequirements(fwId)]);
  if (!framework) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const exportRows = requirements.map((r) => ({
    "Domain":                               r.domain ?? "",
    "Domain Code":                          r.domainCode ?? "",
    "Standard Number":                      r.reqCode,
    "Question":                             r.question,
    "Maturity Level":                       r.maturityLevel ?? "",
    "Supporting Evidence":                  r.supportingEvidence ?? "",
    "Admission Criteria":                   r.admissionCriteria ?? "",
    "Directory Code":                       r.directoryCode ?? "",
    "Directory Type":                       r.directoryType ?? "",
    "Compliance or Maturity?":              r.complianceOrMaturity ?? "",
    "Operational Excellence?":              r.operationalExcellence ?? "",
    "Evident Administrator":                r.evidentAdminOverride ?? r.evidentAdministrator ?? "",
    "Domain Owner":                         r.domainOwnerOverride  ?? r.domainOwner  ?? "",
    "Management and Supporting Sector":     r.managementSector ?? "",
    "Submission Status":                    r.submissionStatus,
    "Comments":                             r.comments ?? "",
    "Evidence File":                        r.evidenceName ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Compliance");

  // Style header row width
  ws["!cols"] = [
    { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 60 }, { wch: 15 },
    { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 22 },
    { wch: 22 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 20 },
  ];

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fileName = `${framework.code}_compliance_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
