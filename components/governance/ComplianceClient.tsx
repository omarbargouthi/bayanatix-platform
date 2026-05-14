"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ComplianceFramework,
  ComplianceRequirement,
  LevelConfig,
  UserOption,
} from "@/lib/queries/gov-compliance";

type Props = {
  frameworks:         ComplianceFramework[];
  activeFramework:    ComplianceFramework | null;
  initialRequirements: ComplianceRequirement[];
  initialLevelConfig: LevelConfig[];
  users:              UserOption[];
};

const STATUSES = [
  { code: "NOT_COMPLETE", label: "Not Complete", hex: "#F59E0B" },
  { code: "COMPLETE",     label: "Complete",     hex: "#10B981" },
  { code: "NA",           label: "N/A",          hex: "#6B7280" },
];

const DEFAULT_LEVEL_COLORS = ["#D84848","#E88030","#2D4AA0","#3D7EC8","#1E8C76","#5CA85C"];
const DEFAULT_LEVEL_NAMES  = ["No Capability","Build","Definition","Activation","Managed","Innovation"];

// Parse "Level 2" → 2, "Level 0" → 0, etc.
function parseLevelNum(ml: string | null): number | null {
  if (!ml) return null;
  const m = ml.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : null;
  return n !== null && n >= 0 && n <= 5 ? n : null;
}

// Derive standard grouping from reqCode when standard column is blank
function deriveStandard(req: ComplianceRequirement): string {
  if (req.standard?.trim()) return req.standard.trim();
  const code = req.reqCode ?? "";
  // "DG-1.2.3" → take up to first "." → "DG-1"
  const dotIdx = code.indexOf(".");
  if (dotIdx > 0) return code.slice(0, dotIdx);
  // "DG-1" no dots → strip last dash segment → "DG"
  const lastDash = code.lastIndexOf("-");
  if (lastDash > 0) return code.slice(0, lastDash);
  return req.domainCode ?? "General";
}

export function ComplianceClient({
  frameworks, activeFramework, initialRequirements, initialLevelConfig, users,
}: Props) {
  const router = useRouter();
  const [reqs, setReqs]               = useState<ComplianceRequirement[]>(initialRequirements);
  const [activeTab, setActiveTab]     = useState<"assessment"|"config">("assessment");
  const [selDomain, setSelDomain]     = useState<string | null>(null);
  const [selStandard, setSelStandard] = useState<string | null>(null);
  const [selLevel, setSelLevel]       = useState<number | null>(null);
  const [saving, setSaving]           = useState<number | null>(null);
  const [expanded, setExpanded]       = useState<number | null>(null);
  const [importing, setImporting]     = useState(false);
  const [importMsg, setImportMsg]     = useState("");
  const [levelCfg, setLevelCfg]       = useState<LevelConfig[]>(initialLevelConfig);
  const [cfgSaving, setCfgSaving]     = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const fwId = activeFramework?.frameworkId;

  // ── level helpers ────────────────────────────────────────────────────────
  const lvlColor = (n: number) =>
    levelCfg.find((c) => c.levelNum === n)?.colorHex ?? DEFAULT_LEVEL_COLORS[n] ?? "#888";
  const lvlName = (n: number) =>
    levelCfg.find((c) => c.levelNum === n)?.name ?? DEFAULT_LEVEL_NAMES[n] ?? `Level ${n}`;
  const lvlDesc = (n: number) =>
    levelCfg.find((c) => c.levelNum === n)?.description ?? "";

  // ── derived data ─────────────────────────────────────────────────────────
  const domains = useMemo(() => {
    const s = new Set(reqs.map((r) => r.domain ?? "Other"));
    return Array.from(s).sort();
  }, [reqs]);

  const standards = useMemo(() => {
    if (!selDomain) return [];
    const s = new Set(
      reqs.filter((r) => (r.domain ?? "Other") === selDomain).map(deriveStandard)
    );
    return Array.from(s).sort();
  }, [reqs, selDomain]);

  const questionsForView = useMemo(() => {
    if (selLevel === null) return [];
    return reqs.filter(
      (r) =>
        (r.domain ?? "Other") === selDomain &&
        (!selStandard || deriveStandard(r) === selStandard) &&
        parseLevelNum(r.maturityLevel) === selLevel
    );
  }, [reqs, selDomain, selStandard, selLevel]);

  const overallStats = useMemo(() => {
    const total   = reqs.length;
    const complete = reqs.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na       = reqs.filter((r) => r.submissionStatus === "NA").length;
    const notDone  = total - complete - na;
    const pct      = Math.round(((complete + na) / Math.max(total, 1)) * 100);
    return { total, complete, na, notDone, pct };
  }, [reqs]);

  // stat helpers
  function domainStats(domain: string) {
    const d = reqs.filter((r) => (r.domain ?? "Other") === domain);
    const c = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c + na) / Math.max(d.length, 1)) * 100) };
  }
  function standardStats(domain: string, std: string) {
    const d = reqs.filter((r) => (r.domain ?? "Other") === domain && deriveStandard(r) === std);
    const c = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c + na) / Math.max(d.length, 1)) * 100) };
  }
  function levelStats(domain: string | null, std: string | null, ln: number) {
    const d = reqs.filter(
      (r) =>
        (!domain || (r.domain ?? "Other") === domain) &&
        (!std    || deriveStandard(r) === std) &&
        parseLevelNum(r.maturityLevel) === ln
    );
    const c  = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c + na) / Math.max(d.length, 1)) * 100) };
  }

  // ── navigation ───────────────────────────────────────────────────────────
  function selectDomain(d: string)  { setSelDomain(d); setSelStandard(null); setSelLevel(null); }
  function selectStandard(s: string){ setSelStandard(s); setSelLevel(null); }
  function resetAll()               { setSelDomain(null); setSelStandard(null); setSelLevel(null); }
  function backToStandards()        { setSelStandard(null); setSelLevel(null); }
  function backToLevels()           { setSelLevel(null); }

  // ── API calls ────────────────────────────────────────────────────────────
  async function handleImport(file: File) {
    if (!fwId) return;
    setImporting(true); setImportMsg("");
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`/api/governance/compliance/${fwId}/import`, { method: "POST", body: fd });
    const data = await res.json();
    setImportMsg(res.ok ? `✓ Imported ${data.imported} requirements` : `✗ ${data.error ?? "Import failed"}`);
    setImporting(false);
    if (res.ok) { resetAll(); router.refresh(); }
  }

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

  async function uploadEvidence(req: ComplianceRequirement, file: File) {
    if (!fwId) return;
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/governance/compliance/${fwId}/evidence/${req.reqId}`, { method: "POST", body: fd });
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? { ...r, evidenceName: file.name } : r));
  }

  async function saveCfg(rows: LevelConfig[]) {
    if (!fwId) return;
    setCfgSaving(true);
    await fetch(`/api/governance/compliance/${fwId}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levels: rows }),
    });
    setLevelCfg(rows); setCfgSaving(false);
  }

  // ── render ───────────────────────────────────────────────────────────────
  const { total, complete, na, notDone, pct } = overallStats;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">Compliance Assessment</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            {activeFramework?.name}{activeFramework?.version ? ` · ${activeFramework.version}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {frameworks.length > 1 && (
            <select
              value={fwId ?? ""}
              onChange={(e) => { resetAll(); router.push(`/governance/compliance?fw=${e.target.value}`); }}
              className="field w-auto text-sm"
            >
              {frameworks.map((f) => <option key={f.frameworkId} value={f.frameworkId}>{f.name}</option>)}
            </select>
          )}
          <label className={`btn btn-sm cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? "Importing…" : "Import Excel"}
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          <button onClick={() => fwId && window.open(`/api/governance/compliance/${fwId}/export`, "_blank")}
            className="btn btn-sm btn-primary">
            Export Excel
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-md ${importMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {importMsg}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Requirements" value={total}    accent="#6366F1" />
        <StatCard label="Complete"           value={complete} accent="#10B981" />
        <StatCard label="N/A"               value={na}       accent="#6B7280" />
        <StatCard label="Not Complete"      value={notDone}  accent="#F59E0B" />
      </div>

      {/* ── Progress bar ── */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-ink">Overall Progress</span>
          <span className="text-sm font-bold text-emerald-600">{pct}%</span>
        </div>
        <div className="h-3 bg-canvas rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(complete/Math.max(total,1)*100)}%` }} />
          <div className="h-full bg-gray-400 transition-all"   style={{ width: `${Math.round(na/Math.max(total,1)*100)}%` }} />
        </div>
        <div className="flex items-center gap-5 mt-2 text-[11px] text-muted">
          <Dot hex="#10B981" label="Complete" />
          <Dot hex="#6B7280" label="N/A" />
          <Dot hex="#E5E7EB" label="Not Complete" />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {(["assessment","config"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? "border-brand-purple text-brand-purple"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}>
            {t === "assessment" ? "Assessment" : "Configuration"}
          </button>
        ))}
      </div>

      {/* ── Assessment tab ── */}
      {activeTab === "assessment" && (
        <>
          {reqs.length === 0 ? (
            <div className="card p-16 text-center">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="font-bold text-brand-deep text-lg mb-2">No requirements loaded</h3>
              <p className="text-ink-soft text-sm mb-4">
                Import the NDI compliance questionnaire Excel file to get started.
              </p>
              <label className="btn btn-primary cursor-pointer inline-flex">
                Import Excel
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
              </label>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              {selDomain && (
                <nav className="flex items-center gap-1.5 text-sm mb-5 flex-wrap">
                  <button onClick={resetAll} className="text-brand-purple hover:underline font-medium">
                    All Domains
                  </button>
                  {selDomain && (
                    <>
                      <span className="text-muted/50 select-none">›</span>
                      <button
                        onClick={backToStandards}
                        className={`font-medium ${selStandard ? "text-brand-purple hover:underline" : "text-ink"}`}>
                        {selDomain}
                      </button>
                    </>
                  )}
                  {selStandard && (
                    <>
                      <span className="text-muted/50 select-none">›</span>
                      <button
                        onClick={backToLevels}
                        className={`font-medium ${selLevel !== null ? "text-brand-purple hover:underline" : "text-ink"}`}>
                        {selStandard}
                      </button>
                    </>
                  )}
                  {selLevel !== null && (
                    <>
                      <span className="text-muted/50 select-none">›</span>
                      <span className="font-bold px-2 py-0.5 rounded text-white text-[12px]"
                        style={{ backgroundColor: lvlColor(selLevel) }}>
                        Level {selLevel} — {lvlName(selLevel)}
                      </span>
                    </>
                  )}
                </nav>
              )}

              {/* Step 1 — Domain grid */}
              {!selDomain && (
                <section>
                  <StepHeader n={1} label="Select a Domain" />
                  <div className="grid grid-cols-3 gap-4">
                    {domains.map((domain) => {
                      const s = domainStats(domain);
                      const domainCode = reqs.find((r) => (r.domain ?? "Other") === domain)?.domainCode ?? "";
                      return (
                        <button key={domain} onClick={() => selectDomain(domain)}
                          className="card p-5 text-left hover:shadow-md hover:border-brand-purple/60 transition-all group border border-line">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div>
                              <div className="font-bold text-brand-deep group-hover:text-brand-purple text-sm leading-snug">{domain}</div>
                              {domainCode && <div className="text-[11px] text-muted font-mono mt-0.5">{domainCode}</div>}
                            </div>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft shrink-0">{s.total}</span>
                          </div>
                          <div className="h-1.5 bg-canvas rounded-full overflow-hidden mb-1.5">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${s.pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">{s.pct}% complete</span>
                            <span className="text-muted">{s.complete} / {s.total}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Step 2 — Standard grid */}
              {selDomain && !selStandard && (
                <section>
                  <StepHeader n={2} label="Select a Standard" />
                  <div className="grid grid-cols-3 gap-4">
                    {standards.map((std) => {
                      const s = standardStats(selDomain, std);
                      // mini level distribution
                      const lvlCounts = Array.from({ length: 6 }, (_, ln) => ({
                        ln, count: reqs.filter(
                          (r) => (r.domain ?? "Other") === selDomain &&
                            deriveStandard(r) === std &&
                            parseLevelNum(r.maturityLevel) === ln
                        ).length,
                      }));
                      return (
                        <button key={std} onClick={() => selectStandard(std)}
                          className="card p-5 text-left hover:shadow-md hover:border-brand-purple/60 transition-all group border border-line">
                          <div className="flex items-start justify-between mb-3 gap-2">
                            <div className="font-bold text-brand-deep group-hover:text-brand-purple text-sm leading-snug">{std}</div>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft shrink-0">{s.total}</span>
                          </div>
                          {/* Level distribution bar */}
                          <div className="h-2 rounded-full overflow-hidden flex mb-2 gap-px">
                            {lvlCounts.filter((l) => l.count > 0).map((l) => (
                              <div key={l.ln} className="h-full rounded-sm"
                                style={{ flex: l.count, backgroundColor: lvlColor(l.ln) }} />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {lvlCounts.filter((l) => l.count > 0).map((l) => (
                              <span key={l.ln} className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                                style={{ backgroundColor: lvlColor(l.ln) }}>
                                L{l.ln}: {l.count}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">{s.pct}% complete</span>
                            <span className="text-muted">{s.complete} / {s.total}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Step 3 — Level picker */}
              {selDomain && selStandard && selLevel === null && (
                <section>
                  <StepHeader n={3} label="Select the Maturity Level" />
                  <p className="text-sm text-ink-soft mb-5">
                    Choose the level the organisation is currently at. Questions for the selected level will be displayed for assessment.
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    {[0, 1, 2, 3, 4, 5].map((ln) => {
                      const s    = levelStats(selDomain, selStandard, ln);
                      const col  = lvlColor(ln);
                      const name = lvlName(ln);
                      const desc = lvlDesc(ln);
                      const hasSqs = s.total > 0;
                      return (
                        <button key={ln}
                          onClick={() => hasSqs && setSelLevel(ln)}
                          disabled={!hasSqs}
                          style={{ borderTop: `4px solid ${col}` }}
                          className={`card p-5 text-left transition-all border border-line rounded-xl ${
                            hasSqs
                              ? "hover:shadow-md cursor-pointer hover:border-brand-purple/40"
                              : "opacity-35 cursor-not-allowed"
                          }`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-extrabold text-lg shrink-0"
                              style={{ backgroundColor: col }}>
                              {ln}
                            </span>
                            <span className="font-bold text-brand-deep text-sm">{name}</span>
                          </div>
                          {desc && <p className="text-[12px] text-ink-soft mb-3 leading-snug line-clamp-2">{desc}</p>}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted">{s.total} questions</span>
                            {hasSqs && (
                              <span className="font-semibold" style={{ color: s.pct > 0 ? "#10B981" : "#9CA3AF" }}>
                                {s.pct}% done
                              </span>
                            )}
                          </div>
                          {hasSqs && (
                            <div className="h-1 bg-canvas rounded-full overflow-hidden mt-2">
                              <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: col }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Step 4 — Questions table */}
              {selDomain && selStandard && selLevel !== null && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: lvlColor(selLevel) }}>
                        {selLevel}
                      </span>
                      <div>
                        <div className="font-bold text-brand-deep">{lvlName(selLevel)}</div>
                        <div className="text-[12px] text-muted">{questionsForView.length} questions</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-muted">
                      <span className="text-emerald-600 font-semibold">
                        {questionsForView.filter((r) => r.submissionStatus === "COMPLETE").length} complete
                      </span>
                      <span>{questionsForView.filter((r) => r.submissionStatus === "NOT_COMPLETE").length} pending</span>
                      <span className="text-gray-500">{questionsForView.filter((r) => r.submissionStatus === "NA").length} N/A</span>
                    </div>
                  </div>

                  {questionsForView.length === 0 ? (
                    <div className="card p-10 text-center text-ink-soft text-sm">
                      No questions at this level for the selected standard.
                    </div>
                  ) : (
                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1100px]">
                          <thead>
                            <tr className="border-b border-line bg-canvas-soft text-left">
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Std. No.</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Question</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Evident Admin</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Domain Owner</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Status</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Evidence</th>
                              <th className="px-3 py-2.5 w-7" />
                            </tr>
                          </thead>
                          <tbody>
                            {questionsForView.map((req) => (
                              <>
                                <tr key={req.reqId}
                                  className={`border-b border-line-soft ${saving === req.reqId ? "opacity-50" : "hover:bg-canvas/40"}`}>
                                  {/* Req code */}
                                  <td className="px-3 py-3">
                                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded text-white"
                                      style={{ backgroundColor: lvlColor(selLevel) }}>
                                      {req.reqCode}
                                    </span>
                                  </td>

                                  {/* Question */}
                                  <td className="px-3 py-3">
                                    <div className="text-[13px] text-ink leading-snug">{req.question}</div>
                                    {req.complianceOrMaturity && (
                                      <div className="text-[10px] text-muted mt-0.5 font-medium">
                                        {req.complianceOrMaturity}
                                        {req.operationalExcellence ? ` · ${req.operationalExcellence}` : ""}
                                      </div>
                                    )}
                                  </td>

                                  {/* Evident Admin — user picker */}
                                  <td className="px-3 py-3">
                                    <UserPicker
                                      value={req.evidentAdminOverride ?? req.evidentAdministrator ?? ""}
                                      users={users}
                                      placeholder="Assign admin"
                                      onSave={(v) => patch(req, { evidentAdminOverride: v || null })}
                                    />
                                  </td>

                                  {/* Domain Owner — user picker */}
                                  <td className="px-3 py-3">
                                    <UserPicker
                                      value={req.domainOwnerOverride ?? req.domainOwner ?? ""}
                                      users={users}
                                      placeholder="Assign owner"
                                      onSave={(v) => patch(req, { domainOwnerOverride: v || null })}
                                    />
                                  </td>

                                  {/* Status */}
                                  <td className="px-3 py-3">
                                    <StatusSelect
                                      value={req.submissionStatus}
                                      onChange={(v) => patch(req, { submissionStatus: v })}
                                    />
                                  </td>

                                  {/* Evidence */}
                                  <td className="px-3 py-3">
                                    <label className="relative cursor-pointer block">
                                      {req.evidenceName ? (
                                        <a
                                          href={`/api/governance/compliance/${fwId}/evidence/${req.reqId}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-brand-purple text-[11px] truncate max-w-[96px] block hover:underline"
                                          title={req.evidenceName}>
                                          {req.evidenceName.length > 14 ? req.evidenceName.slice(0, 12) + "…" : req.evidenceName}
                                        </a>
                                      ) : (
                                        <span className="text-[11px] text-muted/50 italic">Upload…</span>
                                      )}
                                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => e.target.files?.[0] && uploadEvidence(req, e.target.files[0])} />
                                    </label>
                                  </td>

                                  {/* Expand toggle */}
                                  <td className="px-2 py-3">
                                    <button onClick={() => setExpanded(expanded === req.reqId ? null : req.reqId)}
                                      className="text-muted/60 hover:text-ink text-xs leading-none">
                                      {expanded === req.reqId ? "▲" : "▼"}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded detail row */}
                                {expanded === req.reqId && (
                                  <tr key={`${req.reqId}-exp`} className="border-b border-line-soft bg-canvas-soft/60">
                                    <td colSpan={7} className="px-5 py-4">
                                      <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-[12px] mb-4">
                                        {req.admissionCriteria     && <Field label="Admission Criteria"              value={req.admissionCriteria} />}
                                        {req.supportingEvidence    && <Field label="Supporting Evidence"             value={req.supportingEvidence} />}
                                        {req.directoryCode         && <Field label="Directory Code"                  value={req.directoryCode} />}
                                        {req.directoryType         && <Field label="Directory Type"                  value={req.directoryType} />}
                                        {req.operationalExcellence && <Field label="Operational Excellence"          value={req.operationalExcellence} />}
                                        {req.managementSector      && <Field label="Management & Supporting Sector"  value={req.managementSector} />}
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
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* ── Configuration tab ── */}
      {activeTab === "config" && (
        <ConfigTab
          levelCfg={levelCfg}
          frameworkId={fwId ?? 0}
          onSave={saveCfg}
          saving={cfgSaving}
        />
      )}
    </div>
  );
}

// ── Configuration tab ──────────────────────────────────────────────────────────
function ConfigTab({
  levelCfg, frameworkId, onSave, saving,
}: {
  levelCfg: LevelConfig[]; frameworkId: number; onSave: (r: LevelConfig[]) => void; saving: boolean;
}) {
  const [rows, setRows] = useState<LevelConfig[]>(levelCfg);
  const dirty = JSON.stringify(rows) !== JSON.stringify(levelCfg);

  function update(levelNum: number, field: keyof LevelConfig, val: string) {
    setRows((p) => p.map((r) => r.levelNum === levelNum ? { ...r, [field]: val } : r));
  }

  return (
    <div className="space-y-8">
      {/* Level config */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-brand-deep">Level Configuration</h2>
            <p className="text-sm text-ink-soft">Customise names, colours, and descriptions for each maturity level.</p>
          </div>
          {dirty && (
            <button onClick={() => onSave(rows)} disabled={saving}
              className="btn btn-primary btn-sm">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas-soft text-left">
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">Level</th>
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-16">Colour</th>
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-44">Name</th>
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.levelNum} className="border-b border-line-soft">
                  <td className="px-4 py-2.5">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-extrabold text-base"
                      style={{ backgroundColor: row.colorHex }}>
                      {row.levelNum}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="color" value={row.colorHex}
                      onChange={(e) => update(row.levelNum, "colorHex", e.target.value)}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-line p-0.5" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input value={row.name}
                      onChange={(e) => update(row.levelNum, "name", e.target.value)}
                      className="field text-sm w-full" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input value={row.description ?? ""}
                      onChange={(e) => update(row.levelNum, "description", e.target.value)}
                      className="field text-sm w-full" placeholder="Brief description…" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status reference */}
      <div>
        <h2 className="font-bold text-brand-deep mb-1">Submission Statuses</h2>
        <p className="text-sm text-ink-soft mb-4">Fixed statuses used for each requirement assessment.</p>
        <div className="grid grid-cols-3 gap-4">
          {STATUSES.map((s) => (
            <div key={s.code} className="card p-4 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.hex }} />
              <div>
                <div className="font-semibold text-sm text-ink">{s.label}</div>
                <div className="text-[11px] text-muted font-mono">{s.code}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── User picker ───────────────────────────────────────────────────────────────
function UserPicker({ value, users, placeholder, onSave }: {
  value: string; users: UserOption[]; placeholder: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch]   = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter((u) => !q || u.fullName?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 12);
  }, [users, search]);

  if (!editing) {
    return (
      <button onClick={() => { setSearch(""); setEditing(true); }}
        className="text-[12px] text-left w-full truncate block text-ink hover:text-brand-purple transition-colors group">
        {value
          ? <span className="flex items-center gap-1.5"><UserIcon />{value}</span>
          : <span className="text-muted/50 italic">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div className="relative z-50">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        className="field text-[12px] py-0.5 px-1.5 w-full"
        placeholder="Search users…"
      />
      <div className="absolute top-full left-0 mt-0.5 w-56 bg-white rounded-lg shadow-xl border border-line overflow-hidden z-50">
        <button
          onMouseDown={() => { onSave(""); setEditing(false); }}
          className="w-full text-left px-3 py-2 text-[11px] text-muted/70 italic hover:bg-canvas border-b border-line-soft">
          — Remove assignment
        </button>
        {filtered.length === 0 && search && (
          <div className="px-3 py-2 text-[12px] text-muted">No users found</div>
        )}
        {filtered.map((u) => (
          <button key={u.userId}
            onMouseDown={() => { onSave(u.fullName ?? u.email); setEditing(false); }}
            className="w-full text-left px-3 py-2 hover:bg-canvas border-t border-line-soft first:border-0">
            <div className="text-[12px] font-semibold text-ink">{u.fullName ?? u.email}</div>
            <div className="text-[10px] text-muted">{u.email}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Status select ─────────────────────────────────────────────────────────────
function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const s = STATUSES.find((x) => x.code === value) ?? STATUSES[0];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 cursor-pointer appearance-none pr-6"
      style={{
        backgroundColor: `${s.hex}20`,
        color: s.hex,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23${s.hex.slice(1)}'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}
    >
      {STATUSES.map((st) => (
        <option key={st.code} value={st.code}>{st.label}</option>
      ))}
    </select>
  );
}

// ── Comment edit ──────────────────────────────────────────────────────────────
function CommentEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(value);
  return (
    <div className="flex items-end gap-2">
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={2}
        className="field text-[12px] flex-1" placeholder="Add comments…" />
      {val !== value && (
        <button onClick={() => onSave(val)} className="btn btn-sm btn-primary text-[11px] mb-0.5 shrink-0">Save</button>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StepHeader({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="w-7 h-7 rounded-full bg-brand-purple text-white flex items-center justify-center text-xs font-bold shrink-0">{n}</span>
      <h2 className="font-bold text-brand-deep">{label}</h2>
    </div>
  );
}
function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-2xl font-extrabold mb-0.5" style={{ color: accent }}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
function Dot({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: hex }} />
      {label}
    </span>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5 font-semibold">{label}</div>
      <div className="text-ink text-[12px] leading-snug">{value}</div>
    </div>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-muted shrink-0">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6a5 5 0 0 1 10 0H3z" />
    </svg>
  );
}
