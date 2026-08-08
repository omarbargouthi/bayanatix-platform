"use client";

import { useState, useEffect } from "react";

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

export function BulkOperationsClient({ canEdit }: { canEdit: boolean }) {
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

  useEffect(() => {
    fetch("/api/catalog/browse?type=sources").then((r) => r.json()).then(setSources);
    fetch("/api/glossary/picker").then((r) => r.json()).then((d) => setDomains(d.map((x: { glossaryId: number; domainName: string }) => ({ glossaryId: x.glossaryId, domainName: x.domainName }))));
    fetch("/api/admin/custom-asset-types").then((r) => r.ok ? r.json() : []).then(setCustomTypes);
    fetch("/api/admin/custom-relationship-types").then((r) => r.ok ? r.json() : []).then(setCustomRelTypes);
  }, []);

  async function download() {
    setDownloading(true); setDownloadError(null);
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
      window.location.href = `/api/bulk/jobs/${data.jobId}/file`;
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
  const [committed, setCommitted] = useState(false);

  async function upload() {
    if (!file) return;
    setUploading(true); setUploadError(null); setCommitted(false);
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
      setCommitted(true);
      await loadDiff(jobId, filter);
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

  return (
    <div className="space-y-8">
      {/* ── Download ─────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-lg font-bold text-ink mb-1">Download</h2>
        <p className="text-xs text-muted mb-4">Export a scope to Excel for offline bulk editing.</p>

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
          {downloading ? "Preparing…" : "Download Template"}
        </button>
        {!canEdit && <p className="text-[11px] text-muted mt-2">You need edit rights to download bulk templates.</p>}
      </div>

      {/* ── Upload ───────────────────────────────────────────────────────── */}
      {canEdit && (
        <div className="card p-5">
          <h2 className="text-lg font-bold text-ink mb-1">Upload</h2>
          <p className="text-xs text-muted mb-4">Upload an edited template — nothing is applied until you review the preview and commit.</p>

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
      {jobId && totals && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-ink">{committed ? "Result" : "Preview"}</h2>
            {committed && (
              <a href={`/api/bulk/uploads/${jobId}/result-file`} className="text-[12px] font-semibold text-brand-purple hover:underline">
                ⭳ Download Result Workbook
              </a>
            )}
          </div>

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

          {!committed && (
            <div className="flex items-center gap-3 pt-4">
              <button onClick={commit} disabled={committing || totals.updates + totals.creates === 0} className="btn btn-primary btn-sm">
                {committing ? "Committing…" : `Commit ${totals.updates + totals.creates} change(s)`}
              </button>
              {totals.conflicts > 0 && (
                <span className="text-[11px] text-amber-700">
                  {totals.conflicts} row(s) changed since export — {conflictPolicy === "OVERWRITE" ? "will be overwritten" : "will be skipped"} (change the policy above before committing to change this)
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
