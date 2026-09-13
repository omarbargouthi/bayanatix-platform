"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SourceOption = { id: number; name: string; dbType: string | null };
type DomainOption = { glossaryId: number; domainName: string };
type CustomTypeOption = { typeId: number; typeCode: string; typeNameText: string };
type CustomRelTypeOption = { relTypeId: number; relCode: string; relNameText: string };

type RowPlan = {
  sheet: string; rowNumber: number; assetType: string; assetId: number | null;
  outcome: "UPDATE" | "CREATE" | "SKIPPED_NOOP" | "SKIPPED_CONFLICT" | "ERROR";
  changes: { field: string; header: string; oldVal: string | null; newVal: string | null }[];
  errors: string[];
};

type Totals = { rows: number; updates: number; creates: number; skipped: number; errors: number; conflicts: number };

type JobStatus = "RUNNING" | "VALIDATED" | "AWAITING_CONFIRM" | "COMMITTED" | "FAILED" | "CANCELLED";

type BulkJob = {
  jobId: number;
  jobTypeCode: "DOWNLOAD" | "UPLOAD";
  fileName: string | null;
  status: JobStatus;
  totals: Record<string, unknown> | null;
  createdAt: string;
  finishedAt: string | null;
  errorText: string | null;
  hasFile: boolean;
  hasResultFile: boolean;
  hasLogFile: boolean;
  hasRejectedFile: boolean;
};

const STATUS_STYLE: Record<JobStatus, string> = {
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  VALIDATED: "bg-gray-100 text-gray-600 border-gray-200",
  AWAITING_CONFIRM: "bg-amber-50 text-amber-700 border-amber-200",
  COMMITTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  RUNNING: "Running…", VALIDATED: "Validated", AWAITING_CONFIRM: "Awaiting confirmation",
  COMMITTED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled",
};

// Polls GET /api/bulk/jobs/{id} every 1.5s while the job is RUNNING, stopping once
// it reaches a terminal status. Shared by the inline Download/Upload panels (for
// immediate feedback) and the Jobs tab (for the durable list) polls independently.
function usePollJob(jobId: number | null): BulkJob | null {
  const [job, setJob] = useState<BulkJob | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (jobId == null) { setJob(null); return; }
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/bulk/jobs/${jobId}`);
      if (!res.ok || cancelled) return;
      const data: BulkJob = await res.json();
      if (cancelled) return;
      setJob(data);
      if (data.status === "RUNNING") {
        timerRef.current = setTimeout(poll, 1500);
      }
    }
    void poll();

    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
  }, [jobId]);

  return job;
}

function JobFileLinks({ job }: { job: BulkJob }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mt-2">
      {job.jobTypeCode === "DOWNLOAD" && job.hasFile && (
        <a href={`/api/bulk/jobs/${job.jobId}/file`} className="text-[12px] font-semibold text-brand-purple hover:underline">⭳ Download file</a>
      )}
      {job.jobTypeCode === "UPLOAD" && job.hasResultFile && (
        <a href={`/api/bulk/uploads/${job.jobId}/result-file`} className="text-[12px] font-semibold text-brand-purple hover:underline">⭳ Download result workbook</a>
      )}
      {job.jobTypeCode === "UPLOAD" && job.hasRejectedFile && (
        <a href={`/api/bulk/uploads/${job.jobId}/rejected-file`} className="text-[12px] font-semibold text-red-600 hover:underline">⭳ Download rejected records</a>
      )}
      {job.hasLogFile && (
        <a href={`/api/bulk/jobs/${job.jobId}/log-file`} className="text-[12px] font-medium text-muted hover:text-ink hover:underline">⭳ Download log</a>
      )}
    </div>
  );
}

function JobStatusCard({ job, title }: { job: BulkJob; title: string }) {
  return (
    <div className="border border-line rounded-lg px-4 py-3 mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-bold text-ink">{title}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[job.status]}`}>{STATUS_LABEL[job.status]}</span>
        <span className="text-[11px] text-muted">Job #{job.jobId}</span>
      </div>
      {job.status === "FAILED" && job.errorText && (
        <div className="text-[12px] text-red-600 mt-1.5">{job.errorText}</div>
      )}
      {job.status === "COMMITTED" && job.totals && (
        <div className="text-[12px] text-ink-soft mt-1.5">
          {Object.entries(job.totals).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </div>
      )}
      {job.status === "COMMITTED" && <JobFileLinks job={job} />}
    </div>
  );
}

export function BulkOperationsClient({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"download" | "upload" | "jobs">("download");

  // ── Download panel ──────────────────────────────────────────────────────────
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomTypeOption[]>([]);
  const [customRelTypes, setCustomRelTypes] = useState<CustomRelTypeOption[]>([]);
  const [downloadKind, setDownloadKind] = useState<"SOURCE" | "TERMS_ALL" | "TERMS_DOMAIN" | "CUSTOM_TYPE" | "CUSTOM_REL_TYPE">("SOURCE");
  const [sourceId, setSourceId] = useState<number | "">("");
  const [includeTables, setIncludeTables] = useState(true);
  const [includeColumns, setIncludeColumns] = useState(true);
  const [domainId, setDomainId] = useState<number | "">("");
  const [customTypeId, setCustomTypeId] = useState<number | "">("");
  const [customRelTypeId, setCustomRelTypeId] = useState<number | "">("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadJobId, setDownloadJobId] = useState<number | null>(null);
  const downloadJob = usePollJob(downloadJobId);

  useEffect(() => {
    fetch("/api/catalog/browse?type=sources").then((r) => r.json()).then(setSources);
    fetch("/api/glossary/picker").then((r) => r.json()).then((d) => setDomains(d.map((x: { glossaryId: number; domainName: string }) => ({ glossaryId: x.glossaryId, domainName: x.domainName }))));
    fetch("/api/admin/custom-asset-types").then((r) => r.ok ? r.json() : []).then(setCustomTypes);
    fetch("/api/admin/custom-relationship-types").then((r) => r.ok ? r.json() : []).then(setCustomRelTypes);
  }, []);

  async function download() {
    setDownloading(true); setDownloadError(null); setDownloadJobId(null);
    try {
      const scope =
        downloadKind === "SOURCE" ? { type: "DATA_SOURCE", dataSourceId: sourceId, includeTables, includeColumns }
        : downloadKind === "TERMS_ALL" ? { type: "BUSINESS_TERMS_ALL" }
        : downloadKind === "TERMS_DOMAIN" ? { type: "BUSINESS_TERMS_DOMAIN", domainId }
        : downloadKind === "CUSTOM_TYPE" ? { type: "CUSTOM_ASSETS_BY_TYPE", typeId: customTypeId }
        : { type: "CUSTOM_ASSET_LINKS_BY_REL_TYPE", relTypeId: customRelTypeId };
      if (downloadKind === "SOURCE" && !sourceId) { setDownloadError("Choose a data source"); return; }
      if (downloadKind === "TERMS_DOMAIN" && !domainId) { setDownloadError("Choose a domain"); return; }
      if (downloadKind === "CUSTOM_TYPE" && !customTypeId) { setDownloadError("Choose a custom asset type"); return; }
      if (downloadKind === "CUSTOM_REL_TYPE" && !customRelTypeId) { setDownloadError("Choose a relationship type"); return; }

      const res = await fetch("/api/bulk/downloads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) { setDownloadError(data.error ?? "Download failed"); return; }
      setDownloadJobId(data.jobId);
    } finally {
      setDownloading(false);
    }
  }

  // ── Upload panel ────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<"SKIP" | "OVERWRITE">("SKIP");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [rows, setRows] = useState<RowPlan[]>([]);
  const [filter, setFilter] = useState<"all" | "errors" | "conflicts">("all");
  const [committing, setCommitting] = useState(false);
  const [commitJobId, setCommitJobId] = useState<number | null>(null);
  const commitJob = usePollJob(commitJobId);

  async function upload() {
    if (!file) return;
    setUploading(true); setUploadError(null); setCommitJobId(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("strict_mode", String(strictMode));
      fd.append("conflict_policy", conflictPolicy);
      const res = await fetch("/api/bulk/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setJobId(data.jobId);
      setTotals(data.totals);
      await loadDiff(data.jobId, "all");
    } finally {
      setUploading(false);
    }
  }

  async function loadDiff(id: number, f: typeof filter) {
    const res = await fetch(`/api/bulk/uploads/${id}/diff${f !== "all" ? `?filter=${f}` : ""}`);
    const data = await res.json();
    setTotals(data.totals);
    setRows(data.rows);
    setFilter(f);
  }

  async function commit() {
    if (!jobId) return;
    setCommitting(true);
    try {
      const res = await fetch(`/api/bulk/uploads/${jobId}/commit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, conflict_policy: conflictPolicy }),
      });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? "Commit failed"); return; }
      setCommitJobId(data.jobId);
    } finally {
      setCommitting(false);
    }
  }

  const OUTCOME_STYLE: Record<string, string> = {
    UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
    CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    SKIPPED_NOOP: "bg-gray-100 text-gray-500 border-gray-200",
    SKIPPED_CONFLICT: "bg-amber-50 text-amber-700 border-amber-200",
    ERROR: "bg-red-50 text-red-700 border-red-200",
  };

  // ── Jobs tab ────────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const jobsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/bulk/jobs");
    if (!res.ok) return;
    const data = await res.json();
    setJobs(data.data ?? []);
    setJobsLoading(false);
  }, []);

  useEffect(() => {
    if (tab !== "jobs") return;
    void loadJobs();
    function scheduleNext() {
      jobsTimerRef.current = setTimeout(async () => {
        await loadJobs();
        scheduleNext();
      }, 2000);
    }
    scheduleNext();
    return () => { if (jobsTimerRef.current) clearTimeout(jobsTimerRef.current); };
  }, [tab, loadJobs]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 bg-canvas-soft rounded-lg p-1 w-fit">
        {(["download", "upload", "jobs"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md capitalize ${tab === k ? "bg-white text-brand-purple shadow-sm" : "text-muted"}`}
          >
            {k === "jobs" ? "Jobs" : k}
          </button>
        ))}
      </div>

      {/* ── Download ─────────────────────────────────────────────────────── */}
      {tab === "download" && (
      <div className="card p-5">
        <h2 className="text-lg font-bold text-ink mb-1">Download</h2>
        <p className="text-xs text-muted mb-4">Export a scope to Excel for offline bulk editing. Runs as a background job — track it here or in the Jobs tab.</p>

        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "SOURCE"} onChange={() => setDownloadKind("SOURCE")} /> Data Source
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "TERMS_ALL"} onChange={() => setDownloadKind("TERMS_ALL")} /> Business Terms — All
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "TERMS_DOMAIN"} onChange={() => setDownloadKind("TERMS_DOMAIN")} /> Business Terms — By Domain
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "CUSTOM_TYPE"} onChange={() => setDownloadKind("CUSTOM_TYPE")} /> Custom Assets — By Type
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "CUSTOM_REL_TYPE"} onChange={() => setDownloadKind("CUSTOM_REL_TYPE")} /> Custom Asset Links — By Relationship
          </label>
        </div>

        {downloadKind === "SOURCE" && (
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              <option value="">Select a data source…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.dbType})</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={includeTables} onChange={(e) => { setIncludeTables(e.target.checked); if (!e.target.checked) setIncludeColumns(false); }} /> Include Tables
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={includeColumns} disabled={!includeTables} onChange={(e) => setIncludeColumns(e.target.checked)} /> Include Columns
            </label>
          </div>
        )}
        {downloadKind === "TERMS_DOMAIN" && (
          <div className="mb-4">
            <select value={domainId} onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              <option value="">Select a domain…</option>
              {domains.map((d) => <option key={d.glossaryId} value={d.glossaryId}>{d.domainName}</option>)}
            </select>
          </div>
        )}
        {downloadKind === "CUSTOM_TYPE" && (
          <div className="mb-4">
            <select value={customTypeId} onChange={(e) => setCustomTypeId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              <option value="">Select a custom asset type…</option>
              {customTypes.map((t) => <option key={t.typeId} value={t.typeId}>{t.typeNameText} ({t.typeCode})</option>)}
            </select>
          </div>
        )}
        {downloadKind === "CUSTOM_REL_TYPE" && (
          <div className="mb-4">
            <select value={customRelTypeId} onChange={(e) => setCustomRelTypeId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              <option value="">Select a relationship type…</option>
              {customRelTypes.map((r) => <option key={r.relTypeId} value={r.relTypeId}>{r.relNameText} ({r.relCode})</option>)}
            </select>
          </div>
        )}

        {downloadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{downloadError}</div>}
        <button onClick={download} disabled={downloading || !canEdit} className="btn btn-primary btn-sm">
          {downloading ? "Starting…" : "Start Download"}
        </button>
        {!canEdit && <p className="text-[11px] text-muted mt-2">You need edit rights to download bulk templates.</p>}

        {downloadJob && <JobStatusCard job={downloadJob} title="Export" />}
      </div>
      )}

      {/* ── Upload ───────────────────────────────────────────────────────── */}
      {tab === "upload" && canEdit && (
        <div className="card p-5">
          <h2 className="text-lg font-bold text-ink mb-1">Upload</h2>
          <p className="text-xs text-muted mb-4">Upload an edited template — nothing is applied until you review the preview and commit. Committing runs as a background job.</p>

          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={strictMode} onChange={(e) => setStrictMode(e.target.checked)} /> Strict mode (blank cells clear values)
            </label>
            <select value={conflictPolicy} onChange={(e) => setConflictPolicy(e.target.value as "SKIP" | "OVERWRITE")} className="text-sm border border-line rounded-lg px-2 py-1.5 bg-white">
              <option value="SKIP">Conflicts: Skip (default)</option>
              <option value="OVERWRITE">Conflicts: Overwrite anyway</option>
            </select>
            <button onClick={upload} disabled={!file || uploading} className="btn btn-primary btn-sm">
              {uploading ? "Validating…" : "Upload & Validate"}
            </button>
          </div>
          {uploadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{uploadError}</div>}
        </div>
      )}

      {/* ── Diff preview ─────────────────────────────────────────────────── */}
      {tab === "upload" && jobId && totals && (
        <div className="card p-5">
          <h2 className="text-lg font-bold text-ink mb-4">Preview</h2>

          <div className="grid grid-cols-5 gap-3 mb-4">
            {([["Updates", totals.updates, "text-blue-600"], ["Creates", totals.creates, "text-emerald-600"],
               ["No-op", totals.skipped, "text-gray-500"], ["Conflicts", totals.conflicts, "text-amber-600"],
               ["Errors", totals.errors, "text-red-600"]] as const).map(([label, val, cls]) => (
              <div key={label} className="bg-canvas-soft rounded-lg px-3 py-3 text-center">
                <div className={`text-xl font-extrabold ${cls}`}>{val}</div>
                <div className="text-[10px] text-muted mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            {(["all", "errors", "conflicts"] as const).map((f) => (
              <button key={f} onClick={() => loadDiff(jobId, f)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${filter === f ? "bg-brand-purple text-white border-brand-purple" : "text-muted border-line hover:border-brand-purple"}`}>
                {f === "all" ? "All" : f === "errors" ? "Errors only" : "Conflicts only"}
              </button>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1.5 border border-line rounded-lg p-2">
            {rows.map((r, i) => (
              <div key={i} className="border border-line-soft rounded-md px-3 py-2 text-[12px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</span>
                  <span className="text-ink-soft">{r.sheet} row {r.rowNumber}</span>
                  {r.assetId && <span className="text-muted font-mono">#{r.assetId}</span>}
                </div>
                {r.changes.length > 0 && (
                  <div className="mt-1 text-ink-soft">
                    {r.changes.map((c, j) => <div key={j}>{c.header}: <span className="text-muted">&quot;{c.oldVal ?? ""}&quot;</span> → <span className="font-medium">&quot;{c.newVal ?? ""}&quot;</span></div>)}
                  </div>
                )}
                {r.errors.length > 0 && <div className="mt-1 text-red-600">{r.errors.join("; ")}</div>}
              </div>
            ))}
            {rows.length === 0 && <div className="text-center text-muted text-sm py-6">No rows match this filter.</div>}
          </div>

          {!commitJob && (
            <div className="flex items-center gap-3 pt-4">
              <button onClick={commit} disabled={committing || totals.updates + totals.creates === 0} className="btn btn-primary btn-sm">
                {committing ? "Starting…" : `Commit ${totals.updates + totals.creates} change(s)`}
              </button>
              {totals.conflicts > 0 && (
                <span className="text-[11px] text-amber-700">
                  {totals.conflicts} row(s) changed since export — {conflictPolicy === "OVERWRITE" ? "will be overwritten" : "will be skipped"} (change the policy above before committing to change this)
                </span>
              )}
            </div>
          )}

          {commitJob && <JobStatusCard job={commitJob} title="Commit" />}
        </div>
      )}

      {/* ── Jobs ─────────────────────────────────────────────────────────── */}
      {tab === "jobs" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-ink">Jobs</h2>
            <span className="text-[11px] text-muted">{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
          </div>

          {jobsLoading ? (
            <div className="text-center text-muted text-sm py-10">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="text-center text-muted text-sm py-10">No bulk jobs yet — start a download or upload to see it here.</div>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.jobId} className="border border-line rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-canvas-soft text-ink-soft">{j.jobTypeCode}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[j.status]}`}>{STATUS_LABEL[j.status]}</span>
                    <span className="text-[12px] font-semibold text-ink">Job #{j.jobId}</span>
                    {j.fileName && <span className="text-[11px] text-muted font-mono">{j.fileName}</span>}
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    Started {new Date(j.createdAt).toLocaleString()}
                    {j.finishedAt && ` · Finished ${new Date(j.finishedAt).toLocaleString()}`}
                  </div>
                  {j.status === "FAILED" && j.errorText && (
                    <div className="text-[12px] text-red-600 mt-1.5">{j.errorText}</div>
                  )}
                  {j.status === "COMMITTED" && j.totals && (
                    <div className="text-[12px] text-ink-soft mt-1.5">
                      {Object.entries(j.totals).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </div>
                  )}
                  {j.status === "COMMITTED" && <JobFileLinks job={j} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
