"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { usePollBackgroundJob } from "@/components/shared/BackgroundJobsPanel";

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// "Import from Excel" on the lineage page: template download, upload, then live
// status of the background import job with its result/rejected-rows file.
export function LineageImportButton({ onImported }: { onImported?: () => void }) {
  const { t } = useLang();
  const lt = t.lineageTools;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const job = usePollBackgroundJob(jobId);
  const finished = job?.status === "COMPLETED";

  // Refresh whatever lineage the page is showing once the import lands.
  useEffect(() => { if (finished) onImported?.(); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setOpen(false); setFile(null); setError(null); setJobId(null);
  }

  async function upload() {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/lineage/import", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? lt.importFailed); return; }
      setJobId(d.jobId);
    } finally {
      setUploading(false);
    }
  }

  const result = job?.resultJson as { rowsRead?: number; imported?: number; columnLinks?: number; rejected?: number } | null | undefined;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-sm shrink-0">{lt.importExcel}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={close}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
              <div>
                <h2 className="text-[16px] font-bold text-brand-deep">{lt.importTitle}</h2>
                <p className="text-[12px] text-muted mt-0.5">{lt.importDesc}</p>
              </div>
              <button onClick={close} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <a href="/api/lineage/template" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-purple hover:underline">
                ⭳ {lt.downloadTemplate}
              </a>

              {!jobId && (
                <div>
                  <label className="field-label">{lt.chooseFile}</label>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-[13px] text-ink-soft file:me-3 file:btn file:btn-sm file:border-0"
                  />
                </div>
              )}

              {jobId && (!job || job.status === "RUNNING") && (
                <div className="text-[13px] text-ink-soft">
                  {fill(lt.importRunning, { done: job?.progressProcessed ?? 0, total: job?.progressTotal ?? "…" })}
                </div>
              )}

              {job?.status === "COMPLETED" && result && (
                <div className="space-y-2">
                  <div className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                    {fill(lt.importDone, { imported: result.imported ?? 0, rows: result.rowsRead ?? 0, columns: result.columnLinks ?? 0 })}
                  </div>
                  {(result.rejected ?? 0) > 0 && (
                    <div className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      {fill(lt.importRejected, { n: result.rejected ?? 0 })}
                    </div>
                  )}
                  <div className="flex items-center gap-4 flex-wrap">
                    {job.hasResultFile && <a href={`/api/jobs/${job.jobId}/file`} className="text-[13px] font-semibold text-brand-purple hover:underline">⭳ {lt.downloadRejected}</a>}
                    {job.hasLogFile && <a href={`/api/jobs/${job.jobId}/log-file`} className="text-[13px] text-muted hover:text-ink hover:underline">⭳ {lt.downloadLog}</a>}
                  </div>
                </div>
              )}

              {job?.status === "FAILED" && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{job.errorText ?? lt.importFailed}</div>
              )}
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

              <p className="text-[11px] text-muted">{lt.viewJobLogs}</p>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-line">
              <button onClick={close} className="btn btn-sm">{t.common.close}</button>
              {!jobId && (
                <button onClick={upload} disabled={!file || uploading} className="btn btn-primary btn-sm">{uploading ? lt.uploading : lt.upload}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
