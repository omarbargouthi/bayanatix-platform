"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type BulkJob, STATUS_STYLE, STATUS_LABEL, usePollJob, ProgressBar, JobFileLinks, JobStatusCard } from "./shared";

type SourceOption = { id: number; name: string; dbType: string | null };
type DomainOption = { glossaryId: number; domainName: string };
type CustomTypeOption = { typeId: number; typeCode: string; typeNameText: string };
type CustomRelTypeOption = { relTypeId: number; relCode: string; relNameText: string };

const CREATABLE_SHEETS = [
  { value: "DataSources", label: "Data Source" },
  { value: "BusinessTerms", label: "Business Terms" },
  { value: "CustomAssets", label: "Custom Assets" },
  { value: "CustomAssetLinks", label: "Custom Asset Links" },
] as const;

export function BulkOperationsClient({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"download" | "upload" | "jobs">("download");

  // ── Download panel ──────────────────────────────────────────────────────────
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomTypeOption[]>([]);
  const [customRelTypes, setCustomRelTypes] = useState<CustomRelTypeOption[]>([]);
  const [downloadKind, setDownloadKind] = useState<"SOURCE" | "TERMS_ALL" | "TERMS_DOMAIN" | "CUSTOM_TYPE" | "CUSTOM_REL_TYPE" | "EMPTY_TEMPLATE">("SOURCE");
  const [sourceId, setSourceId] = useState<number | "">("");
  const [includeTables, setIncludeTables] = useState(true);
  const [includeColumns, setIncludeColumns] = useState(true);
  const [domainId, setDomainId] = useState<number | "">("");
  const [customTypeId, setCustomTypeId] = useState<number | "">("");
  const [customRelTypeId, setCustomRelTypeId] = useState<number | "">("");
  const [emptyTemplateSheet, setEmptyTemplateSheet] = useState<typeof CREATABLE_SHEETS[number]["value"]>("BusinessTerms");
  const [includeExtended, setIncludeExtended] = useState(true);
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
        : downloadKind === "CUSTOM_REL_TYPE" ? { type: "CUSTOM_ASSET_LINKS_BY_REL_TYPE", relTypeId: customRelTypeId }
        : { type: "EMPTY_TEMPLATE", sheet: emptyTemplateSheet };
      if (downloadKind === "SOURCE" && !sourceId) { setDownloadError("Choose a data source"); return; }
      if (downloadKind === "TERMS_DOMAIN" && !domainId) { setDownloadError("Choose a domain"); return; }
      if (downloadKind === "CUSTOM_TYPE" && !customTypeId) { setDownloadError("Choose a custom asset type"); return; }
      if (downloadKind === "CUSTOM_REL_TYPE" && !customRelTypeId) { setDownloadError("Choose a relationship type"); return; }

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

  // ── Upload panel ────────────────────────────────────────────────────────────
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
        <p className="text-xs text-muted mb-4">Export a scope to Excel for offline bulk editing, or download a blank template to create brand-new records. Runs as a background job — track it here or in the Jobs tab.</p>

        <div className="flex items-center gap-4 mb-4 flex-wrap">
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
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "EMPTY_TEMPLATE"} onChange={() => setDownloadKind("EMPTY_TEMPLATE")} /> Empty Template (new records)
          </label>
        </div>

        {downloadKind === "SOURCE" && (
          <div className="mb-4">
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px] mb-3">
              <option value="">Select a data source…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.dbType})</option>)}
            </select>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeTables} onChange={(e) => { setIncludeTables(e.target.checked); if (!e.target.checked) setIncludeColumns(false); }} /> Include Tables
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeColumns} disabled={!includeTables} onChange={(e) => setIncludeColumns(e.target.checked)} /> Include Columns
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> Include extended/custom attributes
              </label>
            </div>
          </div>
        )}
        {downloadKind === "TERMS_ALL" && (
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> Include extended/custom attributes
            </label>
          </div>
        )}
        {downloadKind === "TERMS_DOMAIN" && (
          <div className="mb-4">
            <select value={domainId} onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px] mb-3">
              <option value="">Select a domain…</option>
              {domains.map((d) => <option key={d.glossaryId} value={d.glossaryId}>{d.domainName}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> Include extended/custom attributes
            </label>
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
        {downloadKind === "EMPTY_TEMPLATE" && (
          <div className="mb-4">
            <select value={emptyTemplateSheet} onChange={(e) => setEmptyTemplateSheet(e.target.value as typeof emptyTemplateSheet)} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              {CREATABLE_SHEETS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <p className="text-[11px] text-muted mt-2">Headers only, no rows. Leave the _ID column blank on every row you add — new records get their id assigned automatically when uploaded.</p>
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
          <p className="text-xs text-muted mb-4">
            Upload an edited (or blank, filled-in) template. It's validated and committed automatically as a background
            job — there's no separate approval step. Any rows that fail land in a downloadable rejected-records file
            you can fix and re-upload.
          </p>

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
              {uploading ? "Starting…" : "Upload"}
            </button>
          </div>
          {uploadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{uploadError}</div>}

          {uploadJob && <JobStatusCard job={uploadJob} title="Upload" />}
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
                  {j.status === "RUNNING" && <ProgressBar job={j} />}
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
