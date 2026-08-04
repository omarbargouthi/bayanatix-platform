import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDomainScorecard, logReportExport } from "@/lib/queries/reports";
import { buildReportPdfHtml } from "@/lib/reports/pdf-template";
import { renderHtmlToPdf } from "@/lib/reports/pdf-render";
import type { KpiCardData } from "@/lib/queries/reports";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

export async function GET(req: Request, { params }: { params: { glossaryId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const glossaryId = Number(params.glossaryId);
  const scorecard = await getDomainScorecard(glossaryId);
  if (!scorecard) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const lang: "en" | "ar" = searchParams.get("lang") === "ar" ? "ar" : "en";

  const kpis: KpiCardData[] = scorecard.capabilities.map((c) => ({
    kpiCode: c.kpiCode, reportCode: c.reportCode,
    nameEn: `${c.reportLabel} — ${c.kpiName}`,
    nameAr: c.kpiNameAr ? `${c.reportLabel} — ${c.kpiNameAr}` : null,
    capabilityCode: c.reportCode, metricKey: null, customSql: null, targetValue: c.targetValue, direction: c.direction,
    format: c.format, sortOrder: 0, isActive: true, value: c.value, breakdown: [],
  }));

  const dgCapability = scorecard.capabilities.find((c) => c.reportCode === "R8_DG_SUMMARY");
  const t = lang === "ar" ? ar : en;

  const html = buildReportPdfHtml({
    lang,
    reportLabel: `${scorecard.domain.name} — ${t.reports.index.scorecardsTitle}`,
    generatedBy: session.fullName,
    domainName: scorecard.domain.name,
    sourceName: null,
    kpis,
    trend: dgCapability?.trend ?? [],
    primaryTarget: dgCapability?.targetValue ?? null,
    drillDownColumns: [
      { label: t.reports.domain.topIssues, get: (r) => String(r.label) },
      { label: t.reports.common.colStatus, get: (r) => String(r.detail) },
    ],
    drillDownRows: scorecard.topIssues,
  });

  const pdf = await renderHtmlToPdf(html);
  await logReportExport(`DOMAIN_${glossaryId}`, session.userId, {}, "PDF");

  const fileName = `${scorecard.domain.name.replace(/\s+/g, "_")}_Scorecard_${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
