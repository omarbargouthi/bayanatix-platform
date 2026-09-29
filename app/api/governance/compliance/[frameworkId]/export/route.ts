import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain } from "@/lib/can";
import { listRequirements, getFramework } from "@/lib/queries/gov-compliance";
import { createJob, finishJob, failJob } from "@/lib/queries/background-jobs";
import * as XLSX from "xlsx";

const JOB_TYPE_GOV_COMPLIANCE_EXPORT = "GOV_COMPLIANCE_EXPORT";

async function runExport(jobId: number, fwId: number): Promise<void> {
  try {
    const [framework, requirements] = await Promise.all([getFramework(fwId), listRequirements(fwId)]);
    if (!framework) throw new Error("Framework not found");

    const exportRows = requirements.map((r) => ({
      "Standard":                            r.standard         ?? "",
      "Standard Code":                       r.standardCode     ?? "",
      "Domain":                              r.domain           ?? "",
      "Domain Code":                         r.domainCode       ?? "",
      "Standard Number":                     r.reqCode,
      "Question":                            r.question,
      "Maturity Level":                      r.maturityLevel    ?? "",
      "Supporting Evidence":                 r.supportingEvidence ?? "",
      "Admission Criteria":                  r.admissionCriteria  ?? "",
      "Directory Code":                      r.directoryCode    ?? "",
      "Directory Type":                      r.directoryType    ?? "",
      "Compliance or Maturity?":             r.complianceOrMaturity ?? "",
      "Operational Excellence?":             r.operationalExcellence ?? "",
      "Evident Administrator":               r.evidentAdminOverride ?? r.evidentAdministrator ?? "",
      "Domain Owner":                        r.domainOwnerOverride  ?? r.domainOwner  ?? "",
      "Management and Supporting Sector":    r.managementSector ?? "",
      "Submission Status":                   r.submissionStatus,
      "Comments":                            r.comments         ?? "",
      "Evidence File":                       r.evidenceName     ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compliance");
    ws["!cols"] = [
      { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 60 }, { wch: 15 },
      { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 22 }, { wch: 22 },
      { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 20 },
    ];

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const fileName = `${framework.code}_compliance_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await finishJob(jobId, {
      resultFileData: buf,
      resultFileName: fileName,
      resultFileMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      resultJson: { requirements: requirements.length },
    });
  } catch (e) {
    await failJob(jobId, (e as Error).message);
  }
}

export async function POST(_req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fwId = Number(params.frameworkId);
  const jobId = await createJob(JOB_TYPE_GOV_COMPLIANCE_EXPORT, { frameworkId: fwId }, session.userId);
  void runExport(jobId, fwId);

  return NextResponse.json({ jobId }, { status: 202 });
}
