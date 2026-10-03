"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type BulkJob, STATUS_STYLE, statusLabel, formatTotals, fillBulk as fill, usePollJob, ProgressBar, JobFileLinks, JobStatusCard } from "./shared";
import { useLang } from "@/lib/lang-context";
import Link from "next/link";
import { usePollBackgroundJob, type BackgroundJob } from "@/components/shared/BackgroundJobsPanel";

type SourceOption = { id: number; name: string; dbType: string | null };
type DomainOption = { glossaryId: number; domainName: string };
type CustomTypeOption = { typeId: number; typeCode: string; typeNameText: string };
type CustomRelTypeOption = { relTypeId: number; relCode: string; relNameText: string };

const CREATABLE_SHEETS = [
  { value: "DataSources", labelKey: "sheetDataSource" },
  { value: "BusinessTerms", labelKey: "sheetBusinessTerms" },
  { value: "CustomAssets", labelKey: "sheetCustomAssets" },
  { value: "CustomAssetLinks", labelKey: "sheetCustomAssetLinks" },
] as const;

export function BulkOperationsClient({ canEdit }: { canEdit: boolean }) {
  const { t } = useLang();
  const b = t.bulkOps;
  const [tab, setTab] = useState<"download" | "upload" | "jobs">("download");

  // A job-completion notification links here with ?tab=jobs so it actually
  // lands on the Jobs tab — avoided useSearchParams (would need a Suspense
  // boundary this page doesn't have) since this only needs to run once on mount.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "download" || requested === "upload" || requested === "jobs") setTab(requested);
  }, []);

  // ── Download panel ──────────────────────────────────────────────────────────
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomTypeOption[]>([]);
  const [customRelTypes, setCustomRelTypes] = useState<CustomRelTypeOption[]>([]);
  const [downloadKind, setDownloadKind] = useState<"SOURCE" | "TERMS_ALL" | "TERMS_DOMAIN" | "CUSTOM_TYPE" | "CUSTOM_REL_TYPE" | "EMPTY_TEMPLATE">("SOURCE");
  const [sourceId, setSourceId] = useState<number | "">("");
  const [includeSchemas, setIncludeSchemas] = useState(true);
  const [includeTables, setIncludeTables] = useState(true);
  const [includeColumns, setIncludeColumns] = useState(true);
  const [domainId, setDomainId] = useState<number | "">("");
  const [customTypeId, setCustomTypeId] = useState<number | "">("");
  const [customRelTypeId, setCustomRelTypeId] = useState<number | "">("");
  const [emptyTemplateSheet, setEmptyTemplateSheet] = useState<typeof CREATABLE_SHEETS[number]["value"]>("BusinessTerms");
  const [includeExtended, setIncludeExtended] = useState(true);
  const [includeLineage, setIncludeLineage] = useState(false);
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
        downloadKind === "SOURCE" ? { type: "DATA_SOURCE", dataSourceId: sourceId, includeSchemas, includeTables, includeColumns }
        : downloadKind === "TERMS_ALL" ? { type: "BUSINESS_TERMS_ALL" }
        : downloadKind === "TERMS_DOMAIN" ? { type: "BUSINESS_TERMS_DOMAIN", domainId }
        : downloadKind === "CUSTOM_TYPE" ? { type: "CUSTOM_ASSETS_BY_TYPE", typeId: customTypeId }
        : downloadKind === "CUSTOM_REL_TYPE" ? { type: "CUSTOM_ASSET_LINKS_BY_REL_TYPE", relTypeId: customRelTypeId }
        : { type: "EMPTY_TEMPLATE", sheet: emptyTemplateSheet };
      if (downloadKind === "SOURCE" && !sourceId) { setDownloadError(b.errChooseSource); return; }
      if (downloadKind === "TERMS_DOMAIN" && !domainId) { setDownloadError(b.errChooseDomain); return; }
      if (downloadKind === "CUSTOM_TYPE" && !customTypeId) { setDownloadError(b.errChooseType); return; }
      if (downloadKind === "CUSTOM_REL_TYPE" && !customRelTypeId) { setDownloadError(b.errChooseRel); return; }

      const res = await fetch("/api/bulk/downloads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, includeExtended, includeLineage: downloadKind === "SOURCE" && includeLineage }),
      });
      const data = await res.json();
      if (!res.ok) { setDownloadError(data.error ?? b.downloadFailed); return; }
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
  const [lineageJobId, setLineageJobId] = useState<number | null>(null);
  const lineageJob = usePollBackgroundJob(lineageJobId);

  async function upload() {
    if (!file) return;
    setUploading(true); setUploadError(null); setUploadJobId(null); setLineageJobId(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("strict_mode", String(strictMode));
      fd.append("conflict_policy", conflictPolicy);
      const res = await fetch("/api/bulk/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? b.uploadFailed); return; }
      setUploadJobId(data.jobId ?? null);
      setLineageJobId(data.lineageJobId ?? null);
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
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${tab === k ? "bg-white text-brand-purple shadow-sm" : "text-muted"}`}
          >
            {k === "jobs" ? b.tabJobs : k === "upload" ? b.tabUpload : b.tabDownload}
          </button>
        ))}
      </div>

      {/* ── Download ─────────────────────────────────────────────────────── */}
      {tab === "download" && (
      <div className="card p-5">
        <h2 className="text-lg font-bold text-ink mb-1">{b.downloadTitle}</h2>
        <p className="text-xs text-muted mb-4">{b.downloadDesc}</p>

        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "SOURCE"} onChange={() => setDownloadKind("SOURCE")} /> {b.kindSource}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "TERMS_ALL"} onChange={() => setDownloadKind("TERMS_ALL")} /> {b.kindTermsAll}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "TERMS_DOMAIN"} onChange={() => setDownloadKind("TERMS_DOMAIN")} /> {b.kindTermsDomain}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "CUSTOM_TYPE"} onChange={() => setDownloadKind("CUSTOM_TYPE")} /> {b.kindCustomType}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "CUSTOM_REL_TYPE"} onChange={() => setDownloadKind("CUSTOM_REL_TYPE")} /> {b.kindCustomRel}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={downloadKind === "EMPTY_TEMPLATE"} onChange={() => setDownloadKind("EMPTY_TEMPLATE")} /> {b.kindEmpty}
          </label>
        </div>

        {downloadKind === "SOURCE" && (
          <div className="mb-4">
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px] mb-3">
              <option value="">{b.selectSource}</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.dbType})</option>)}
            </select>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeSchemas} onChange={(e) => setIncludeSchemas(e.target.checked)} /> {b.includeSchemas}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeTables} onChange={(e) => { setIncludeTables(e.target.checked); if (!e.target.checked) setIncludeColumns(false); }} /> {b.includeTables}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeColumns} disabled={!includeTables} onChange={(e) => setIncludeColumns(e.target.checked)} /> {b.includeColumns}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> {b.includeExtended}
              </label>
              <label className="flex items-center gap-1.5 text-sm" title={b.includeLineageHint}>
                <input type="checkbox" checked={includeLineage} onChange={(e) => setIncludeLineage(e.target.checked)} /> {b.includeLineage}
              </label>
            </div>
          </div>
        )}
        {downloadKind === "TERMS_ALL" && (
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> {b.includeExtended}
            </label>
          </div>
        )}
        {downloadKind === "TERMS_DOMAIN" && (
          <div className="mb-4">
            <select value={domainId} onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px] mb-3">
              <option value="">{b.selectDomain}</option>
              {domains.map((d) => <option key={d.glossaryId} value={d.glossaryId}>{d.domainName}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={includeExtended} onChange={(e) => setIncludeExtended(e.target.checked)} /> {b.includeExtended}
            </label>
          </div>
        )}
        {downloadKind === "CUSTOM_TYPE" && (
          <div className="mb-4">
            <select value={customTypeId} onChange={(e) => setCustomTypeId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              <option value="">{b.selectCustomType}</option>
              {customTypes.map((t) => <option key={t.typeId} value={t.typeId}>{t.typeNameText} ({t.typeCode})</option>)}
            </select>
          </div>
        )}
        {downloadKind === "CUSTOM_REL_TYPE" && (
          <div className="mb-4">
            <select value={customRelTypeId} onChange={(e) => setCustomRelTypeId(e.target.value ? Number(e.target.value) : "")} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              <option value="">{b.selectRelType}</option>
              {customRelTypes.map((r) => <option key={r.relTypeId} value={r.relTypeId}>{r.relNameText} ({r.relCode})</option>)}
            </select>
          </div>
        )}
        {downloadKind === "EMPTY_TEMPLATE" && (
          <div className="mb-4">
            <select value={emptyTemplateSheet} onChange={(e) => setEmptyTemplateSheet(e.target.value as typeof emptyTemplateSheet)} className="text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[220px]">
              {CREATABLE_SHEETS.map((s) => <option key={s.value} value={s.value}>{b[s.labelKey]}</option>)}
            </select>
            <p className="text-[11px] text-muted mt-2">{b.emptyTemplateHint}</p>
          </div>
        )}

        {downloadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{downloadError}</div>}
        <button onClick={download} disabled={downloading || !canEdit} className="btn btn-primary btn-sm">
          {downloading ? b.starting : b.startDownload}
        </button>
        {!canEdit && <p className="text-[11px] text-muted mt-2">{b.needEdit}</p>}

        {downloadJob && <JobStatusCard job={downloadJob} title={b.export} />}
      </div>
      )}

      {/* ── Upload ───────────────────────────────────────────────────────── */}
      {tab === "upload" && canEdit && (
        <div className="card p-5">
          <h2 className="text-lg font-bold text-ink mb-1">{b.uploadTitle}</h2>
          <p className="text-xs text-muted mb-4">{b.uploadDesc}</p>

          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={strictMode} onChange={(e) => setStrictMode(e.target.checked)} /> {b.strictMode}
            </label>
            <select value={conflictPolicy} onChange={(e) => setConflictPolicy(e.target.value as "SKIP" | "OVERWRITE")} className="text-sm border border-line rounded-lg px-2 py-1.5 bg-white">
              <option value="SKIP">{b.conflictSkip}</option>
              <option value="OVERWRITE">{b.conflictOverwrite}</option>
            </select>
            <button onClick={upload} disabled={!file || uploading} className="btn btn-primary btn-sm">
              {uploading ? b.starting : b.upload}
            </button>
          </div>
          {uploadError && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{uploadError}</div>}

          {uploadJob && <JobStatusCard job={uploadJob} title={b.upload} />}
          {lineageJobId && <LineageJobCard job={lineageJob} jobId={lineageJobId} />}
        </div>
      )}

      {/* ── Jobs ─────────────────────────────────────────────────────────── */}
      {tab === "jobs" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-ink">{b.jobsTitle}</h2>
            <span className="text-[11px] text-muted">{fill(b.jobsCount, { n: jobs.length })}</span>
          </div>

          {jobsLoading ? (
            <div className="text-center text-muted text-sm py-10">{b.loading}</div>
          ) : jobs.length === 0 ? (
            <div className="text-center text-muted text-sm py-10">{b.noJobs}</div>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.jobId} className="border border-line rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-canvas-soft text-ink-soft">{(b.jobTypes as Record<string, string>)[j.jobTypeCode] ?? j.jobTypeCode}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[j.status]}`}>{statusLabel(b, j.status)}</span>
                    <span className="text-[12px] font-semibold text-ink">{fill(b.jobNo, { id: j.jobId })}</span>
                    {j.fileName && <span className="text-[11px] text-muted font-mono">{j.fileName}</span>}
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {fill(b.started, { date: new Date(j.createdAt).toLocaleString() })}
                    {j.finishedAt && ` · ${fill(b.finished, { date: new Date(j.finishedAt).toLocaleString() })}`}
                  </div>
                  {j.status === "RUNNING" && <ProgressBar job={j} />}
                  {j.status === "FAILED" && j.errorText && (
                    <div className="text-[12px] text-red-600 mt-1.5">{j.errorText}</div>
                  )}
                  {j.status === "COMMITTED" && j.totals && (
                    <div className="text-[12px] text-ink-soft mt-1.5">
                      {formatTotals(b, j.totals)}
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

// Status of the Lineage sheet of a bulk upload (a lineage import job).
function LineageJobCard({ job, jobId }: { job: BackgroundJob | null; jobId: number }) {
  const b = useLang().t.bulkOps;
  const r = (job?.resultJson ?? {}) as { rowsRead?: number; imported?: number; rejected?: number; scannedSkipped?: number; mode?: string; requestId?: number | null };
  return (
    <div className="mt-4 border border-line rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-canvas-soft text-ink-soft">LINEAGE</span>
        <span className="text-[12px] font-semibold text-ink">{fill(b.lineageSheet, { id: jobId })}</span>
        <span className="text-[11px] text-muted">{!job || job.status === "RUNNING" ? b.running : job.status === "COMPLETED" ? b.done : b.failed}</span>
      </div>
      {job?.status === "COMPLETED" && (
        <div className="text-[12px] text-ink-soft mt-1.5 space-y-1">
          <div>
            {fill(b.lineageRows, { read: r.rowsRead ?? 0, imported: r.imported ?? 0, rejected: r.rejected ?? 0 })}
            {r.scannedSkipped ? fill(b.lineageScannedSkipped, { n: r.scannedSkipped }) : ""}
          </div>
          {r.mode === "PENDING" && r.requestId && <div><Link href={`/requests/${r.requestId}`} className="text-brand-purple underline">{fill(b.lineagePending, { id: r.requestId })}</Link></div>}
          {r.mode === "APPLIED" && <div className="text-emerald-700">{b.lineageApplied}</div>}
          <div className="flex gap-4">
            {job.hasResultFile && <a href={`/api/jobs/${jobId}/file`} className="text-brand-purple font-semibold hover:underline">⭳ {b.rejectedRows}</a>}
            {job.hasLogFile && <a href={`/api/jobs/${jobId}/log-file`} className="text-muted hover:underline">⭳ {b.log}</a>}
          </div>
        </div>
      )}
      {job?.status === "FAILED" && <div className="text-[12px] text-red-600 mt-1.5">{job.errorText}</div>}
    </div>
  );
}
