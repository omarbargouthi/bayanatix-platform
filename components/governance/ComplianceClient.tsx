"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ComplianceFramework, ComplianceRequirement } from "@/lib/queries/gov-compliance";

type Props = {
  frameworks:          ComplianceFramework[];
  activeFramework:     ComplianceFramework | null;
  initialRequirements: ComplianceRequirement[];
};

const STATUSES = [
  { code: "NOT_COMPLETE", label: "Not Complete", cls: "bg-gray-100 text-gray-600" },
  { code: "COMPLETE",     label: "Complete",     cls: "bg-emerald-100 text-emerald-700" },
  { code: "NA",           label: "N/A",          cls: "bg-blue-100 text-blue-600" },
];

export function ComplianceClient({ frameworks, activeFramework, initialRequirements }: Props) {
  const router = useRouter();
  const [reqs, setReqs]           = useState<ComplianceRequirement[]>(initialRequirements);
  const [domainFilter, setDomainFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch]       = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [saving, setSaving]       = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const fwId = activeFramework?.frameworkId;

  const domains = useMemo(() => {
    const s = new Set(reqs.map((r) => r.domain ?? "Other").filter(Boolean));
    return Array.from(s).sort();
  }, [reqs]);

  const filtered = useMemo(() => {
    return reqs.filter((r) => {
      if (domainFilter !== "ALL" && (r.domain ?? "Other") !== domainFilter) return false;
      if (statusFilter !== "ALL" && r.submissionStatus !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.question.toLowerCase().includes(q) && !r.reqCode.toLowerCase().includes(q) && !(r.domain ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [reqs, domainFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ComplianceRequirement[]>();
    for (const r of filtered) {
      const key = r.domain ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const stats = useMemo(() => {
    const total     = reqs.length;
    const complete  = reqs.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na        = reqs.filter((r) => r.submissionStatus === "NA").length;
    const notDone   = total - complete - na;
    const pct       = Math.round(((complete + na) / Math.max(total, 1)) * 100);
    return { total, complete, na, notDone, pct };
  }, [reqs]);

  // ── Import ──
  async function handleImport(file: File) {
    if (!fwId) return;
    setImporting(true);
    setImportMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/governance/compliance/${fwId}/import`, { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      setImportMsg(`✓ Imported ${data.imported} requirements`);
      router.refresh();
    } else {
      setImportMsg(`✗ ${data.error ?? "Import failed"}`);
    }
    setImporting(false);
  }

  // ── Export ──
  function handleExport() {
    if (!fwId) return;
    window.open(`/api/governance/compliance/${fwId}/export`, "_blank");
  }

  // ── Save assessment field ──
  async function patch(req: ComplianceRequirement, updates: Partial<ComplianceRequirement>) {
    if (!fwId) return;
    const merged = { ...req, ...updates };
    setSaving(req.reqId);
    await fetch(`/api/governance/compliance/${fwId}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reqId:                merged.reqId,
        submissionStatus:     merged.submissionStatus,
        evidentAdminOverride: merged.evidentAdminOverride,
        domainOwnerOverride:  merged.domainOwnerOverride,
        comments:             merged.comments,
      }),
    });
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? merged : r));
    setSaving(null);
  }

  // ── Upload evidence ──
  async function uploadEvidence(req: ComplianceRequirement, file: File) {
    if (!fwId) return;
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/governance/compliance/${fwId}/evidence/${req.reqId}`, { method: "POST", body: fd });
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? { ...r, evidenceName: file.name } : r));
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">Compliance Assessment</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            {activeFramework?.name} {activeFramework?.version ? `· ${activeFramework.version}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {frameworks.length > 1 && (
            <select value={fwId ?? ""} onChange={(e) => router.push(`/governance/compliance?fw=${e.target.value}`)} className="field w-auto text-sm">
              {frameworks.map((f) => <option key={f.frameworkId} value={f.frameworkId}>{f.name}</option>)}
            </select>
          )}
          {/* Import */}
          <label className={`btn btn-sm cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? "Importing…" : "Import Excel"}
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          {/* Export */}
          <button onClick={handleExport} className="btn btn-sm btn-primary">Export Excel</button>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-md ${importMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {importMsg}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Requirements" value={stats.total}    color="text-ink" />
        <StatCard label="Complete"           value={stats.complete} color="text-emerald-600" />
        <StatCard label="N/A"               value={stats.na}       color="text-blue-600" />
        <StatCard label="Not Complete"      value={stats.notDone}  color="text-amber-600" />
      </div>

      {/* Progress */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-ink">Overall Completion</span>
          <span className="text-sm font-bold text-emerald-600">{stats.pct}%</span>
        </div>
        <div className="h-2.5 bg-canvas rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.round((stats.complete / Math.max(stats.total, 1)) * 100)}%` }} />
          <div className="bg-blue-400 h-full transition-all"    style={{ width: `${Math.round((stats.na      / Math.max(stats.total, 1)) * 100)}%` }} />
        </div>
        <div className="flex items-center gap-4 mt-1.5 text-[11px] text-muted">
          <Dot color="bg-emerald-500" label="Complete" />
          <Dot color="bg-blue-400"    label="N/A" />
          <Dot color="bg-gray-300"    label="Not Complete" />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" className="field w-56 text-sm" />

        {/* Domain filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-muted font-semibold mr-1">Domain:</span>
          {["ALL", ...domains].map((d) => (
            <button key={d} onClick={() => setDomainFilter(d)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${domainFilter === d ? "bg-brand-purple text-white border-brand-purple" : "border-line text-ink-soft hover:border-brand-purple hover:text-brand-purple"}`}>
              {d === "ALL" ? "All Domains" : d}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted font-semibold mr-1">Status:</span>
          {["ALL", ...STATUSES.map((s) => s.code)].map((code) => (
            <button key={code} onClick={() => setStatusFilter(code)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${statusFilter === code ? "bg-brand-purple text-white border-brand-purple" : "border-line text-ink-soft hover:border-brand-purple hover:text-brand-purple"}`}>
              {code === "ALL" ? "All" : STATUSES.find((s) => s.code === code)?.label ?? code}
            </button>
          ))}
        </div>

        <span className="text-[12px] text-muted ml-auto">{filtered.length} of {reqs.length} requirements</span>
      </div>

      {/* ── Requirements table ── */}
      {reqs.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-ink-soft text-sm">No requirements loaded. Click <strong>Import Excel</strong> to upload the NDI questionnaire.</p>
          <p className="text-muted text-[12px] mt-1">Expected columns: Domain, Domain Code, Standard Number, Question, Maturity Level, Supporting Evidence, Admission Criteria, Directory Code, Directory Type, Compliance or Maturity?, Operational Excellence?, Evident Administrator, Domain Owner, Management and Supporting Sector</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([domain, domainReqs]) => (
            <div key={domain} className="card overflow-hidden">
              {/* Domain header */}
              <div className="bg-brand-purple/5 px-5 py-3 border-b border-line flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-sm text-brand-deep">{domain}</h3>
                  <span className="text-[11px] text-muted">{domainReqs[0]?.domainCode ?? ""}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted">
                  <span className="text-emerald-600 font-semibold">{domainReqs.filter((r) => r.submissionStatus === "COMPLETE").length} complete</span>
                  <span>{domainReqs.filter((r) => r.submissionStatus === "NOT_COMPLETE").length} pending</span>
                  <span className="text-blue-600">{domainReqs.filter((r) => r.submissionStatus === "NA").length} N/A</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-line-soft bg-canvas-soft text-left">
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Std. Number</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold">Question</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-24">Maturity</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">Type</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Evident Admin</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Domain Owner</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-32">Status</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Evidence</th>
                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {domainReqs.map((req) => (
                      <>
                        <tr key={req.reqId}
                          className={`border-b border-line-soft transition-colors ${saving === req.reqId ? "opacity-60" : "hover:bg-canvas/40"}`}>
                          {/* Standard Number */}
                          <td className="px-3 py-2.5 font-mono text-[11px] text-brand-purple font-bold">{req.reqCode}</td>

                          {/* Question */}
                          <td className="px-3 py-2.5">
                            <div className="text-[13px] text-ink leading-snug line-clamp-2">{req.question}</div>
                            {req.supportingEvidence && (
                              <div className="text-[11px] text-muted mt-0.5 line-clamp-1">
                                Evidence: {req.supportingEvidence}
                              </div>
                            )}
                          </td>

                          {/* Maturity Level */}
                          <td className="px-3 py-2.5">
                            {req.maturityLevel && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-brand-purple/10 text-brand-purple rounded">
                                {req.maturityLevel}
                              </span>
                            )}
                          </td>

                          {/* Compliance or Maturity / Directory Type */}
                          <td className="px-3 py-2.5 text-[11px] text-muted">
                            {req.complianceOrMaturity}
                          </td>

                          {/* Evident Administrator (editable) */}
                          <td className="px-3 py-2.5">
                            <InlineEdit
                              value={req.evidentAdminOverride ?? req.evidentAdministrator ?? ""}
                              placeholder="—"
                              onSave={(v) => patch(req, { evidentAdminOverride: v || null })}
                            />
                          </td>

                          {/* Domain Owner (editable) */}
                          <td className="px-3 py-2.5">
                            <InlineEdit
                              value={req.domainOwnerOverride ?? req.domainOwner ?? ""}
                              placeholder="—"
                              onSave={(v) => patch(req, { domainOwnerOverride: v || null })}
                            />
                          </td>

                          {/* Submission Status */}
                          <td className="px-3 py-2.5">
                            <select
                              value={req.submissionStatus}
                              onChange={(e) => patch(req, { submissionStatus: e.target.value })}
                              className={`text-[11px] font-semibold px-2 py-1 rounded-md border-0 cursor-pointer appearance-none ${STATUSES.find((s) => s.code === req.submissionStatus)?.cls ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {STATUSES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                            </select>
                          </td>

                          {/* Evidence upload */}
                          <td className="px-3 py-2.5">
                            <label className="cursor-pointer text-[11px] hover:underline relative">
                              {req.evidenceName ? (
                                <a href={`/api/governance/compliance/${fwId}/evidence/${req.reqId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-brand-purple truncate max-w-[100px] block" title={req.evidenceName}>
                                  {req.evidenceName.length > 14 ? req.evidenceName.slice(0, 12) + "…" : req.evidenceName}
                                </a>
                              ) : (
                                <span className="text-muted/60 italic">Upload…</span>
                              )}
                              <input type="file" className="absolute inset-0 opacity-0 w-full cursor-pointer"
                                onChange={(e) => e.target.files?.[0] && uploadEvidence(req, e.target.files[0])} />
                            </label>
                          </td>

                          {/* Expand */}
                          <td className="px-3 py-2.5">
                            <button onClick={() => setExpandedRow(expandedRow === req.reqId ? null : req.reqId)}
                              className="text-muted hover:text-ink text-base leading-none">
                              {expandedRow === req.reqId ? "▲" : "▼"}
                            </button>
                          </td>
                        </tr>

                        {expandedRow === req.reqId && (
                          <tr key={`${req.reqId}-exp`} className="bg-canvas-soft border-b border-line-soft">
                            <td colSpan={9} className="px-5 py-4">
                              <div className="grid grid-cols-3 gap-4 text-[12px] mb-3">
                                {req.admissionCriteria && <Field label="Admission Criteria" value={req.admissionCriteria} />}
                                {req.directoryCode && <Field label="Directory Code" value={req.directoryCode} />}
                                {req.directoryType && <Field label="Directory Type" value={req.directoryType} />}
                                {req.operationalExcellence && <Field label="Operational Excellence" value={req.operationalExcellence} />}
                                {req.managementSector && <Field label="Management & Supporting Sector" value={req.managementSector} />}
                                {req.supportingEvidence && <Field label="Supporting Evidence" value={req.supportingEvidence} />}
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Comments</label>
                                <CommentEdit
                                  value={req.comments ?? ""}
                                  onSave={(v) => patch(req, { comments: v || null })}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline edit cell ──────────────────────────────────────────────────────────
function InlineEdit({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value);
  if (!editing) {
    return (
      <button onClick={() => { setVal(value); setEditing(true); }}
        className="text-[12px] text-left text-ink hover:text-brand-purple transition-colors w-full truncate block">
        {value || <span className="text-muted/50 italic">{placeholder}</span>}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input value={val} onChange={(e) => setVal(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") { onSave(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
        className="field text-[12px] py-0.5 px-1.5 w-full min-w-0" />
      <button onClick={() => { onSave(val); setEditing(false); }} className="text-[10px] text-emerald-600 font-bold shrink-0">✓</button>
    </div>
  );
}

// ── Comment edit ─────────────────────────────────────────────────────────────
function CommentEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(value);
  return (
    <div className="flex items-end gap-2">
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={2}
        className="field text-[12px] flex-1" placeholder="Add comments here…" />
      {val !== value && (
        <button onClick={() => onSave(val)} className="btn btn-sm btn-primary text-[11px] mb-0.5 shrink-0">Save</button>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5 font-semibold">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
function Dot({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full inline-block ${color}`}/>{label}</span>;
}
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`text-xl font-extrabold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
