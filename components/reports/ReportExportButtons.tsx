"use client";

import { useState } from "react";
import { BackgroundJobsPanel } from "@/components/shared/BackgroundJobsPanel";

// Replaces the old plain <a href="/api/reports/{code}/export?..."> download
// links — those ran fully synchronously (the browser waited for the whole
// XLSX build, or Puppeteer for PDF, before the download started). Both
// export endpoints are now POST routes that create a background_jobs row
// and return immediately; this triggers them and surfaces the resulting
// job (progress while RUNNING, download links once COMPLETED) via the
// shared BackgroundJobsPanel.
export function ReportExportButtons({
  reportCode, domainId, sourceId, ownerId, labelXlsx, labelPdf,
}: {
  reportCode: string; domainId?: string; sourceId?: string; ownerId?: string;
  labelXlsx: string; labelPdf: string;
}) {
  const [latestJobId, setLatestJobId] = useState<number | null>(null);
  const [triggering, setTriggering] = useState<"XLSX" | "PDF" | null>(null);

  const body = {
    domainGlossaryId: domainId ? Number(domainId) : undefined,
    sourceId: sourceId ? Number(sourceId) : undefined,
    ownerId: ownerId || undefined,
  };

  async function trigger(kind: "XLSX" | "PDF") {
    setTriggering(kind);
    try {
      const url = kind === "XLSX" ? `/api/reports/${reportCode}/export` : `/api/reports/${reportCode}/export-pdf`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) setLatestJobId(data.jobId);
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => trigger("XLSX")}
          disabled={triggering !== null}
          className="text-sm px-3 py-2 rounded-lg bg-brand-purple text-white hover:bg-brand-violet disabled:opacity-60"
        >
          {triggering === "XLSX" ? "Starting…" : labelXlsx}
        </button>
        <button
          onClick={() => trigger("PDF")}
          disabled={triggering !== null}
          className="text-sm px-3 py-2 rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/5 disabled:opacity-60"
        >
          {triggering === "PDF" ? "Starting…" : labelPdf}
        </button>
      </div>
      <BackgroundJobsPanel jobTypeCodes={["REPORT_EXPORT_XLSX", "REPORT_EXPORT_PDF"]} latestJobId={latestJobId} title="Report Exports" />
    </div>
  );
}
