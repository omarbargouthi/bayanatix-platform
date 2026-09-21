"use client";

import { useState } from "react";
import { usePollJob, JobStatusCard } from "./shared";

// Scoped Download/Upload, reusing the exact same job engine as /bulk-operations
// (components/bulk/BulkOperationsClient.tsx) but with the scope fixed to a given
// set of tables instead of picked from a full scope-config UI — for the Table
// page's "Export / Import" action and the Schema page's "Export Selected" bulk
// action. Download uses the SELECTED scope (lib/bulk/scope-resolver.ts), which
// pulls in each table's columns automatically. Upload is genuinely scope-free —
// it validates+commits whatever _ID/_TYPE rows are in the workbook — so it's the
// same panel as the main Bulk Operations page, unmodified.
export function EntityBulkExportImportModal({
  entityIds,
  title,
  onClose,
}: {
  entityIds: number[];
  title: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"download" | "upload">("download");

  const [includeExtended, setIncludeExtended] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadJobId, setDownloadJobId] = useState<number | null>(null);
  const downloadJob = usePollJob(downloadJobId);

  async function download() {
    setDownloading(true); setDownloadError(null); setDownloadJobId(null);
    try {
      const scope = { type: "SELECTED", entityIds, includeColumns: true };
      const res = await fetch("/api/bulk/downloads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, includeExtended }),
      });
      const data = await res.json();
      if (!res.ok) { setDownloadError(data.error ?? "Download failed"); return; }
      setDownloadJobId(data.jobId);
    } finally {
      setDownloading(false);
    }
  }

  const [file, setFile] = useState<File | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<"SKIP" | "OVERWRITE">("SKIP");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadJobId, setUploadJobId] = useState<number | null>(null);
  const uploadJob = usePollJob(uploadJobId);

  async function upload() {
    if (!file) return;
    setUploading(true); setUploadError(null); setUploadJobId(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("strict_mode", String(strictMode));
      fd.append("conflict_policy", conflictPolicy);
      const res = await fetch("/api/bulk/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setUploadJobId(data.jobId);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-bold text-brand-deep">Export / Import</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5 truncate max-w-[380px]">{title}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center gap-1 bg-canvas-soft rounded-lg p-1 w-fit">
            {(["download", "upload"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-md capitalize ${tab === k ? "bg-white text-brand-purple shadow-sm" : "text-muted"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {tab === "download" && (
            <div>
              <p className="text-xs text-muted mb-4">
                Exports {entityIds.length} table{entityIds.length !== 1 ? "s" : ""} and all of their columns to Excel
                for offline bulk editing. Runs as a background job.
              </p>
              <label className="flex items-center gap-1.5 text-sm mb-4">
                <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> Include extended/custom attributes
              </label>
              {downloadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{downloadError}</div>}
              <button onClick={download} disabled={downloading} className="btn btn-primary btn-sm">
                {downloading ? "Starting…" : "Start Download"}
              </button>
              {downloadJob && <JobStatusCard job={downloadJob} title="Export" />}
            </div>
          )}

          {tab === "upload" && (
            <div>
              <p className="text-xs text-muted mb-4">
                Upload an edited template. It's validated and committed automatically as a background job. Any rows
                that fail land in a downloadable rejected-records file you can fix and re-upload.
              </p>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={strictMode} onChange={(e) => setStrictMode(e.target.checked)} /> Strict mode
                </label>
                <select value={conflictPolicy} onChange={(e) => setConflictPolicy(e.target.value as "SKIP" | "OVERWRITE")} className="text-sm border border-line rounded-lg px-2 py-1.5 bg-white">
                  <option value="SKIP">Conflicts: Skip</option>
                  <option value="OVERWRITE">Conflicts: Overwrite</option>
                </select>
              </div>
              {uploadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{uploadError}</div>}
              <button onClick={upload} disabled={!file || uploading} className="btn btn-primary btn-sm">
                {uploading ? "Starting…" : "Upload"}
              </button>
              {uploadJob && <JobStatusCard job={uploadJob} title="Upload" />}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line shrink-0">
          <button onClick={onClose} className="btn">Close</button>
        </div>
      </div>
    </div>
  );
}
