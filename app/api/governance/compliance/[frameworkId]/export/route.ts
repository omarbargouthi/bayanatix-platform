import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain } from "@/lib/can";
import { listRequirements, getFramework, getConfigItems, type ConfigItem } from "@/lib/queries/gov-compliance";
import { createJob, finishJob, failJob } from "@/lib/queries/background-jobs";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";
import * as XLSX from "xlsx";

const JOB_TYPE_GOV_COMPLIANCE_EXPORT = "GOV_COMPLIANCE_EXPORT";

// Same raw-text sniffing ComplianceClient.tsx's complianceTypeLabel() falls
// back to when a framework has no COMPLIANCE_TYPE config items of its own --
// only ever used as a last resort below, same as on the page.
function complianceTypeFallbackLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.includes("امتثال") || raw.toLowerCase().includes("compliance")) return "Compliance";
  if (raw.includes("نضج") || raw.toLowerCase().includes("maturity")) return "Maturity";
  return null;
}

async function runExport(jobId: number, fwId: number, lang: string): Promise<void> {
  try {
    const [framework, requirements, configItems] = await Promise.all([
      getFramework(fwId), listRequirements(fwId), getConfigItems(fwId),
    ]);
    if (!framework) throw new Error("Framework not found");

    // Same lookup ComplianceClient.tsx's complianceTypeMap builds: an
    // admin-configured COMPLIANCE_TYPE item (with its own real translations),
    // keyed by every raw value it could show up as (its code, its English
    // label, or any of its translated labels).
    const complianceTypeMap = new Map<string, ConfigItem>();
    configItems.filter((i) => i.configGroup === "COMPLIANCE_TYPE").forEach((item) => {
      complianceTypeMap.set(item.label, item);
      complianceTypeMap.set(item.code, item);
      Object.values(item.labelTranslations ?? {}).forEach((v) => { if (v) complianceTypeMap.set(v, item); });
    });
    function resolveComplianceType(raw: string | null | undefined): string {
      if (!raw) return "";
      const cfgItem = complianceTypeMap.get(raw);
      if (cfgItem) return pickTranslation(cfgItem.label, cfgItem.labelTranslations, lang);
      return complianceTypeFallbackLabel(raw) ?? raw;
    }

    // Same resolution the Compliance Assessment page itself uses for every
    // translatable field (dispT in ComplianceClient.tsx): canonical English
    // (*_en, falling back to the legacy pre-migration column for a framework
    // that hasn't been backfilled) with the Translation Workbench's override
    // layered on top for a non-English export language. Previously this read
    // the bare legacy columns directly, regardless of requested language or
    // any Workbench translation -- for NDI (legacy columns are Arabic-native)
    // that happened to look right only when the export was implicitly in
    // Arabic; for PIPEDA (legacy columns are English) it only ever exported
    // in English even if the viewer was in Arabic.
    //
    // "Directory Type" is deliberately left as *_en-falls-back-to-legacy only
    // (no pickTranslation) -- there's no Workbench translation key for it,
    // same as the page's own display, so a framework missing its
    // directory_type_en backfill (NDI itself, confirmed live) shows the
    // legacy text here exactly as it does on the page. That's a real content
    // gap to close via a migration/backfill, not an export bug.
    const exportRows = requirements.map((r) => ({
      "Standard":                            pickTranslation(r.standard, r.standardTranslations, lang) || "",
      "Standard Code":                       r.standardCode     ?? "",
      "Domain":                              (lang === "en" ? (r.domainEn ?? r.domain) : r.domain) ?? "",
      "Domain Code":                         r.domainCode       ?? "",
      "Standard Number":                     r.reqCode,
      "Question":                            pickTranslation(r.questionEn ?? r.question, r.questionTranslations, lang),
      "Maturity Level":                      r.maturityLevel    ?? "",
      "Supporting Evidence":                 pickTranslation(r.supportingEvidenceEn ?? r.supportingEvidence, r.supportingEvidenceTranslations, lang) || "",
      "Admission Criteria":                  pickTranslation(r.admissionCriteriaEn ?? r.admissionCriteria, r.admissionCriteriaTranslations, lang) || "",
      "Directory Code":                      r.directoryCode    ?? "",
      "Directory Type":                      r.directoryTypeEn  ?? r.directoryType ?? "",
      "Compliance or Maturity?":             resolveComplianceType(r.complianceOrMaturity),
      "Operational Excellence?":             r.operationalExcellence ?? "",
      "Evident Administrator":               r.evidentAdminOverride ?? r.evidentAdministrator ?? "",
      "Domain Owner":                        r.domainOwnerOverride  ?? r.domainOwner  ?? "",
      "Management and Supporting Sector":    pickTranslation(r.managementSectorEn ?? r.managementSector, r.managementSectorTranslations, lang) || "",
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

export async function POST(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const lang = typeof body.lang === "string" ? body.lang : "en";

  const fwId = Number(params.frameworkId);
  const jobId = await createJob(JOB_TYPE_GOV_COMPLIANCE_EXPORT, { frameworkId: fwId, lang }, session.userId);
  void runExport(jobId, fwId, lang);

  return NextResponse.json({ jobId }, { status: 202 });
}
