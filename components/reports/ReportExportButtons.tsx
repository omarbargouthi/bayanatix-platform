"use client";

import { useState } from "react";
import { usePollBackgroundJob } from "@/components/shared/BackgroundJobsPanel";

// Replaces the old plain <a href="/api/reports/{code}/export?..."> download
// links — those ran fully synchronously (the browser waited for the whole
// XLSX build, or Puppeteer for PDF, before the download started). Both
// export endpoints are now POST routes that create a background_jobs row and
// return immediately. This triggers them and shows only a brief one-line
// status for the job just started -- the full job list/history belongs in
// Notifications → Jobs or Admin → Audit Log → Job Logs (both already surface
// every job type including these two), not embedded on the report page
// itself. A previous version used the full <BackgroundJobsPanel> here, which
// showed a whole job history inline; that panel is still the right choice for
// pages whose job IS the primary content (Admin > Configuration, Bulk
// Operations), just not for a one-off export action on a report page.
export function ReportExportButtons({
  reportCode, domainId, sourceId, ownerId, labelXlsx, labelPdf,
}: {
  reportCode: string; domainId?: string; sourceId?: string; ownerId?: string;
  labelXlsx: string; labelPdf: string;
}) {
  const [latestJobId, setLatestJobId] = useState<number | null>(null);
  const [triggering, setTriggering] = useState<"XLSX" | "PDF" | null>(null);
  const latestJob = usePollBackgroundJob(latestJobId);

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
      {latestJob && latestJob.status !== "COMPLETED" && latestJob.status !== "FAILED" && (
        <div className="text-xs text-muted mt-2">Export started — track progress and download from Notifications &rarr; Jobs.</div>
      )}
      {latestJob?.status === "COMPLETED" && (
        <div className="text-xs text-emerald-700 mt-2">✓ Export ready — download it from Notifications &rarr; Jobs.</div>
      )}
      {latestJob?.status === "FAILED" && (
        <div className="text-xs text-red-600 mt-2">Export failed{latestJob.errorText ? `: ${latestJob.errorText}` : "."} See Notifications &rarr; Jobs for details.</div>
      )}
    </div>
  );
}
