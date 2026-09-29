import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { REPORT_REGISTRY } from "@/lib/reports/report-registry";
import { buildReportPdfHtml } from "@/lib/reports/pdf-template";
import { renderHtmlToPdf } from "@/lib/reports/pdf-render";
import { getBusinessDomains, getDataSourcesLite, logReportExport } from "@/lib/queries/reports";
import { applyStewardScope } from "@/lib/reports/access";
import { createJob, finishJob, failJob } from "@/lib/queries/background-jobs";
import type { SessionUser } from "@/lib/types";

const JOB_TYPE_REPORT_EXPORT_PDF = "REPORT_EXPORT_PDF";

async function runExport(
  jobId: number, session: SessionUser, reportCode: string,
  input: { domainGlossaryId?: number; sourceId?: number; ownerId?: string; lang?: "en" | "ar" },
): Promise<void> {
  try {
    const descriptor = REPORT_REGISTRY[reportCode];
    if (!descriptor) throw new Error("Unknown report");
    const lang = input.lang === "ar" ? "ar" : "en";

    const filters = await applyStewardScope(session, input);
    const [data, domains, sources] = await Promise.all([
      descriptor.fetch(filters, { limit: 200, offset: 0 }),
      getBusinessDomains(),
      getDataSourcesLite(),
    ]);
    const domainName = filters.domainGlossaryId != null ? domains.find((d) => d.glossaryId === filters.domainGlossaryId)?.name ?? null : null;
    const sourceName = filters.sourceId != null ? sources.find((s) => s.dataSourceId === filters.sourceId)?.sourceName ?? null : null;

    const html = buildReportPdfHtml({
      lang, reportLabel: descriptor.label, generatedBy: session.fullName, domainName, sourceName,
      kpis: data.kpis, trend: data.trend, primaryTarget: data.kpis[0]?.targetValue ?? null,
      drillDownColumns: descriptor.drillDownColumns, drillDownRows: data.drillDown,
    });

    const pdf = await renderHtmlToPdf(html);
    await logReportExport(descriptor.code, session.userId, filters, "PDF");
    const fileName = `${descriptor.code}_${new Date().toISOString().slice(0, 10)}.pdf`;

    await finishJob(jobId, { resultFileData: pdf, resultFileName: fileName, resultFileMimeType: "application/pdf" });
  } catch (e) {
    await failJob(jobId, (e as Error).message);
  }
}

export async function POST(req: Request, { params }: { params: { reportCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const descriptor = REPORT_REGISTRY[params.reportCode];
  if (!descriptor) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { domainGlossaryId?: number; sourceId?: number; ownerId?: string; lang?: "en" | "ar" };
  const jobId = await createJob(JOB_TYPE_REPORT_EXPORT_PDF, { reportCode: params.reportCode, ...body }, session.userId);
  void runExport(jobId, session, params.reportCode, body);

  return NextResponse.json({ jobId }, { status: 202 });
}
