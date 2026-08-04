import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { REPORT_REGISTRY } from "@/lib/reports/report-registry";
import { buildReportPdfHtml } from "@/lib/reports/pdf-template";
import { renderHtmlToPdf } from "@/lib/reports/pdf-render";
import { getBusinessDomains, getDataSourcesLite, logReportExport } from "@/lib/queries/reports";
import { applyStewardScope } from "@/lib/reports/access";

export async function GET(req: Request, { params }: { params: { reportCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const descriptor = REPORT_REGISTRY[params.reportCode];
  if (!descriptor) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const lang: "en" | "ar" = searchParams.get("lang") === "ar" ? "ar" : "en";
  const domainGlossaryId = searchParams.get("domain") ? Number(searchParams.get("domain")) : undefined;
  const sourceId = searchParams.get("source") ? Number(searchParams.get("source")) : undefined;
  const ownerId = searchParams.get("owner") ?? undefined;

  const filters = await applyStewardScope(session, { domainGlossaryId, sourceId, ownerId });
  const [data, domains, sources] = await Promise.all([
    descriptor.fetch(filters, { limit: 200, offset: 0 }),
    getBusinessDomains(),
    getDataSourcesLite(),
  ]);

  const domainName = filters.domainGlossaryId != null ? domains.find((d) => d.glossaryId === filters.domainGlossaryId)?.name ?? null : null;
  const sourceName = filters.sourceId != null ? sources.find((s) => s.dataSourceId === filters.sourceId)?.sourceName ?? null : null;

  const html = buildReportPdfHtml({
    lang,
    reportLabel: descriptor.label,
    generatedBy: session.fullName,
    domainName,
    sourceName,
    kpis: data.kpis,
    trend: data.trend,
    primaryTarget: data.kpis[0]?.targetValue ?? null,
    drillDownColumns: descriptor.drillDownColumns,
    drillDownRows: data.drillDown,
  });

  const pdf = await renderHtmlToPdf(html);
  await logReportExport(descriptor.code, session.userId, filters, "PDF");

  const fileName = `${descriptor.code}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
