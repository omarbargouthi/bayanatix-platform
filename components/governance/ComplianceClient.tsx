"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  ComplianceFramework,
  ComplianceRequirement,
  LevelConfig,
  UserOption,
  ConfigItem,
  MaturitySelection,
} from "@/lib/queries/gov-compliance";
import type { SessionUser } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
  frameworks:                ComplianceFramework[];
  activeFramework:           ComplianceFramework | null;
  initialRequirements:       ComplianceRequirement[];
  initialLevelConfig:        LevelConfig[];
  users:                     UserOption[];
  initialMaturitySelections: MaturitySelection[];
  initialConfigItems:        ConfigItem[];
  currentUser:               SessionUser;
};

type HistoryEntry = {
  historyId: number; fieldName: string; fieldLabel: string;
  oldValue: string | null; newValue: string | null;
  changedBy: string; changedByName: string | null; changedAt: string;
};

type CollabThread = {
  threadId: number; title: string; status: string;
  createdBy: string; createdAt: string; messageCount: number;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_LEVEL_COLORS = ["#D84848","#E88030","#2D4AA0","#3D7EC8","#1E8C76","#5CA85C"];
const DEFAULT_LEVEL_NAMES  = ["No Capability","Build","Definition","Activation","Managed","Innovation"];

const WORKFLOW_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: "Draft",     color: "#6B7280", bg: "#F3F4F6" },
  SUBMITTED: { label: "Submitted", color: "#D97706", bg: "#FEF3C7" },
  CONFIRMED: { label: "Confirmed", color: "#2563EB", bg: "#DBEAFE" },
  ENDORSED:  { label: "Endorsed",  color: "#059669", bg: "#D1FAE5" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseLevelNum(ml: string | null): number | null {
  if (!ml) return null;
  const m = ml.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : null;
  return n !== null && n >= 0 && n <= 5 ? n : null;
}

function deriveStandard(req: ComplianceRequirement): string {
  if (req.standard?.trim()) return req.standard.trim();
  const code = req.reqCode ?? "";
  const dotIdx = code.indexOf(".");
  if (dotIdx > 0) return code.slice(0, dotIdx);
  const lastDash = code.lastIndexOf("-");
  if (lastDash > 0) return code.slice(0, lastDash);
  return req.domainCode ?? "General";
}

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

// ── Main component ────────────────────────────────────────────────────────────

export function ComplianceClient({
  frameworks, activeFramework, initialRequirements, initialLevelConfig,
  users, initialMaturitySelections, initialConfigItems, currentUser,
}: Props) {
  const router = useRouter();
  const [reqs, setReqs]                   = useState<ComplianceRequirement[]>(initialRequirements);
  const [levelCfg, setLevelCfg]           = useState<LevelConfig[]>(initialLevelConfig);
  const [configItems, setConfigItems]     = useState<ConfigItem[]>(initialConfigItems);
  const [maturitySels, setMaturitySels]   = useState<Record<string, number>>(
    Object.fromEntries(initialMaturitySelections.map((s) => [s.standardCode, s.selectedLevel]))
  );
  const [activeTab, setActiveTab]         = useState<"assessment"|"config"|"admin">("assessment");
  const [selDomain, setSelDomain]         = useState<string | null>(null);
  const [selStandard, setSelStandard]     = useState<string | null>(null);
  const [selLevel, setSelLevel]           = useState<number | null>(null);
  const [saving, setSaving]               = useState<Set<number>>(new Set());
  const [expanded, setExpanded]           = useState<number | null>(null);
  const [importing, setImporting]         = useState(false);
  const [importMsg, setImportMsg]         = useState("");
  const [cfgSaving, setCfgSaving]         = useState(false);
  const [levelWarning, setLevelWarning]   = useState<{ std: string; newLevel: number } | null>(null);
  const [translations, setTranslations]   = useState<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const fwId = activeFramework?.frameworkId;

  const lvlColor = (n: number) => levelCfg.find((c) => c.levelNum === n)?.colorHex ?? DEFAULT_LEVEL_COLORS[n] ?? "#888";
  const lvlName  = (n: number) => levelCfg.find((c) => c.levelNum === n)?.name    ?? DEFAULT_LEVEL_NAMES[n]  ?? `Level ${n}`;
  const lvlDesc  = (n: number) => levelCfg.find((c) => c.levelNum === n)?.description ?? "";

  const domains = useMemo(() => {
    const s = new Set(reqs.map((r) => r.domain ?? "Other"));
    return Array.from(s).sort();
  }, [reqs]);

  const standards = useMemo(() => {
    if (!selDomain) return [];
    const seen = new Map<string, ComplianceRequirement>();
    reqs.filter((r) => (r.domain ?? "Other") === selDomain)
        .forEach((r) => { const k = deriveStandard(r); if (!seen.has(k)) seen.set(k, r); });
    return Array.from(seen.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([std, rep]) => ({ std, question: rep.question }));
  }, [reqs, selDomain]);

  const questionsForView = useMemo(() => {
    if (selLevel === null) return [];
    return reqs.filter(
      (r) => (r.domain ?? "Other") === selDomain &&
             (!selStandard || deriveStandard(r) === selStandard) &&
             parseLevelNum(r.maturityLevel) === selLevel
    );
  }, [reqs, selDomain, selStandard, selLevel]);

  const overallStats = useMemo(() => {
    const total    = reqs.length;
    const complete = reqs.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na       = reqs.filter((r) => r.submissionStatus === "NA").length;
    const notDone  = total - complete - na;
    const pct      = Math.round(((complete + na) / Math.max(total, 1)) * 100);
    return { total, complete, na, notDone, pct };
  }, [reqs]);

  function domainStats(domain: string) {
    const d = reqs.filter((r) => (r.domain ?? "Other") === domain);
    const c  = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c + na) / Math.max(d.length, 1)) * 100) };
  }
  function standardStats(domain: string, std: string) {
    const d = reqs.filter((r) => (r.domain ?? "Other") === domain && deriveStandard(r) === std);
    const c  = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c + na) / Math.max(d.length, 1)) * 100) };
  }
  function levelStats(domain: string | null, std: string | null, ln: number) {
    const d = reqs.filter(
      (r) => (!domain || (r.domain ?? "Other") === domain) &&
             (!std    || deriveStandard(r) === std) &&
             parseLevelNum(r.maturityLevel) === ln
    );
    const c  = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c + na) / Math.max(d.length, 1)) * 100) };
  }

  function selectDomain(d: string)   { setSelDomain(d); setSelStandard(null); setSelLevel(null); setExpanded(null); }
  function selectStandard(s: string) { setSelStandard(s); setSelLevel(null); setExpanded(null); }
  function resetAll()                { setSelDomain(null); setSelStandard(null); setSelLevel(null); setExpanded(null); }
  function backToStandards()         { setSelStandard(null); setSelLevel(null); setExpanded(null); }
  function backToLevels()            { setSelLevel(null); setExpanded(null); }

  async function handleImport(file: File) {
    if (!fwId) return;
    setImporting(true); setImportMsg("");
    const fd = new FormData(); fd.append("file", file);
    const res  = await fetch(`/api/governance/compliance/${fwId}/import`, { method: "POST", body: fd });
    const data = await res.json();
    setImportMsg(res.ok ? `✓ Imported ${data.imported} requirements` : `✗ ${data.error ?? "Import failed"}`);
    setImporting(false);
    if (res.ok) { resetAll(); router.refresh(); }
  }

  async function patch(req: ComplianceRequirement, updates: Partial<ComplianceRequirement>) {
    if (!fwId) return;
    const merged = { ...req, ...updates };
    setSaving((s) => new Set([...s, req.reqId]));
    await fetch(`/api/governance/compliance/${fwId}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reqId: merged.reqId,
        submissionStatus:     merged.submissionStatus,
        evidentAdminOverride: merged.evidentAdminOverride,
        domainOwnerOverride:  merged.domainOwnerOverride,
        managementNotes:      merged.managementNotes,
        comments:             merged.comments,
      }),
    });
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? merged : r));
    setSaving((s) => { const n = new Set(s); n.delete(req.reqId); return n; });
  }

  async function uploadEvidence(req: ComplianceRequirement, file: File) {
    if (!fwId) return;
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/governance/compliance/${fwId}/evidence/${req.reqId}`, { method: "POST", body: fd });
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? { ...r, evidenceName: file.name } : r));
  }

  async function advanceWorkflow(req: ComplianceRequirement, action: "submit"|"confirm"|"endorse") {
    if (!fwId) return;
    const res = await fetch(`/api/governance/compliance/${fwId}/workflow/${req.reqId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return;
    const next: Record<string, string> = { submit: "SUBMITTED", confirm: "CONFIRMED", endorse: "ENDORSED" };
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? { ...r, workflowStatus: next[action] } : r));
  }

  async function selectLevel(std: string, ln: number) {
    if (!fwId) return;
    const existing = maturitySels[std];
    if (existing !== undefined && existing !== ln) {
      setLevelWarning({ std, newLevel: ln });
      return;
    }
    await doSelectLevel(std, ln, false);
  }

  async function doSelectLevel(std: string, ln: number, clear: boolean) {
    if (!fwId) return;
    await fetch(`/api/governance/compliance/${fwId}/maturity-selection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standardCode: std, selectedLevel: ln, clear }),
    });
    if (clear) {
      // Clear local assessment state for reqs in this standard
      setReqs((p) => p.map((r) =>
        deriveStandard(r) === std
          ? { ...r, submissionStatus: "NOT_COMPLETE", evidenceName: null, workflowStatus: null, endorsedBy: null, endorsedAt: null }
          : r
      ));
    }
    setMaturitySels((s) => ({ ...s, [std]: ln }));
    setSelLevel(ln);
    setLevelWarning(null);
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

  async function translateText(text: string): Promise<string | null> {
    if (!fwId) return null;
    if (translations[text]) return translations[text];
    const res = await fetch(`/api/governance/compliance/${fwId}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.translation) {
      setTranslations((t) => ({ ...t, [text]: data.translation }));
      return data.translation;
    }
    return null;
  }

  const { total, complete, na, notDone, pct } = overallStats;
  const selectedQuestion = selStandard
    ? (reqs.find((r) => deriveStandard(r) === selStandard)?.question ?? "")
    : "";

  return (
    <div>
      {/* Level change warning modal */}
      {levelWarning && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="font-bold text-brand-deep text-lg mb-2">Change Maturity Level?</h3>
            <p className="text-sm text-ink-soft mb-4">
              Changing the selected level for <span className="font-semibold text-ink">{levelWarning.std}</span> from{" "}
              <span className="font-semibold">Level {maturitySels[levelWarning.std]}</span> to{" "}
              <span className="font-semibold">Level {levelWarning.newLevel}</span> will{" "}
              <span className="text-red-600 font-semibold">clear all assessments</span> for this standard.
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setLevelWarning(null)} className="btn btn-sm">Cancel</button>
              <button
                onClick={() => doSelectLevel(levelWarning.std, levelWarning.newLevel, true)}
                className="btn btn-sm bg-red-500 hover:bg-red-600 text-white border-red-500">
                Clear &amp; Change Level
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
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
              className="field w-auto text-sm">
              {frameworks.map((f) => <option key={f.frameworkId} value={f.frameworkId}>{f.name}</option>)}
            </select>
          )}
          <label className={`btn btn-sm cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? "Importing…" : "Import Excel"}
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          <button
            onClick={() => fwId && window.open(`/api/governance/compliance/${fwId}/export`, "_blank")}
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Requirements" value={total}    accent="#6366F1" />
        <StatCard label="Complete"           value={complete} accent="#10B981" />
        <StatCard label="N/A"                value={na}       accent="#6B7280" />
        <StatCard label="Not Completed"      value={notDone}  accent="#F59E0B" />
      </div>

      {/* Progress */}
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
          <Dot hex="#E5E7EB" label="Not Completed" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {(["assessment","config","admin"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t ? "border-brand-purple text-brand-purple" : "border-transparent text-ink-soft hover:text-ink"
            }`}>
            {t === "assessment" ? "Assessment" : t === "config" ? "Configuration" : "Administration"}
          </button>
        ))}
      </div>

      {/* ── Assessment tab ─────────────────────────────────────────────────── */}
      {activeTab === "assessment" && (
        <>
          {reqs.length === 0 ? (
            <div className="card p-16 text-center">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="font-bold text-brand-deep text-lg mb-2">No requirements loaded</h3>
              <p className="text-ink-soft text-sm mb-4">Import the NDI compliance Excel file to get started.</p>
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
                  <button onClick={resetAll} className="text-brand-purple hover:underline font-medium">All Domains</button>
                  <span className="text-muted/50">›</span>
                  <button
                    onClick={backToStandards}
                    className={`font-medium ${selStandard ? "text-brand-purple hover:underline" : "text-ink"}`}>
                    {selDomain}
                  </button>
                  {selStandard && (
                    <>
                      <span className="text-muted/50">›</span>
                      <button
                        onClick={backToLevels}
                        className={`font-medium ${selLevel !== null ? "text-brand-purple hover:underline" : "text-ink"}`}>
                        {selStandard}
                      </button>
                    </>
                  )}
                  {selLevel !== null && (
                    <>
                      <span className="text-muted/50">›</span>
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
                              <div className="font-bold text-brand-deep group-hover:text-brand-purple text-sm">{domain}</div>
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
                    {standards.map(({ std, question }) => {
                      const s = standardStats(selDomain, std);
                      const selectedLvl = maturitySels[std];
                      const lvlCounts = Array.from({ length: 6 }, (_, ln) => ({
                        ln, count: reqs.filter(
                          (r) => (r.domain ?? "Other") === selDomain &&
                            deriveStandard(r) === std && parseLevelNum(r.maturityLevel) === ln
                        ).length,
                      }));
                      return (
                        <button key={std} onClick={() => selectStandard(std)}
                          className="card p-5 text-left hover:shadow-md hover:border-brand-purple/60 transition-all group border border-line">
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <div className="font-bold text-brand-deep group-hover:text-brand-purple text-sm font-mono">{std}</div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {selectedLvl !== undefined && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                                  style={{ backgroundColor: lvlColor(selectedLvl) }}>
                                  L{selectedLvl}
                                </span>
                              )}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft">{s.total}</span>
                            </div>
                          </div>
                          {question && (
                            <p className="text-[11px] text-ink-soft mb-3 leading-snug line-clamp-2 text-right" dir="rtl">{question}</p>
                          )}
                          <div className="h-2 rounded-full overflow-hidden flex mb-2 gap-px">
                            {lvlCounts.filter((l) => l.count > 0).map((l) => (
                              <div key={l.ln} className="h-full rounded-sm"
                                style={{ flex: l.count, backgroundColor: lvlColor(l.ln) }} />
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
                  {selectedQuestion && (
                    <div className="mb-5 p-4 bg-canvas-soft rounded-xl border border-line">
                      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{selStandard}</div>
                      <p className="text-sm text-ink leading-relaxed text-right" dir="rtl">{selectedQuestion}</p>
                    </div>
                  )}
                  {maturitySels[selStandard] !== undefined ? (
                    <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
                      Level <strong>{maturitySels[selStandard]}</strong> ({lvlName(maturitySels[selStandard])}) is currently selected for this standard.
                      Selecting a different level will clear all assessments.
                    </p>
                  ) : (
                    <p className="text-sm text-ink-soft mb-5">
                      Choose the level the organisation is currently at. Evidence items for the selected level will be shown.
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    {[0,1,2,3,4,5].map((ln) => {
                      const s         = levelStats(selDomain, selStandard, ln);
                      const col       = lvlColor(ln);
                      const name      = lvlName(ln);
                      const desc      = lvlDesc(ln);
                      const hasSqs    = s.total > 0;
                      const isSelected = maturitySels[selStandard] === ln;
                      const isLocked   = maturitySels[selStandard] !== undefined && !isSelected;
                      return (
                        <button key={ln}
                          onClick={() => hasSqs && selectLevel(selStandard, ln)}
                          disabled={!hasSqs}
                          style={{
                            borderTop: `4px solid ${col}`,
                            outline: isSelected ? `2px solid ${col}` : undefined,
                            outlineOffset: isSelected ? "2px" : undefined,
                          }}
                          className={`card p-5 text-left transition-all rounded-xl relative ${
                            isSelected
                              ? "shadow-md"
                              : isLocked
                                ? "opacity-40 cursor-not-allowed"
                                : hasSqs
                                  ? "hover:shadow-md cursor-pointer hover:border-brand-purple/40 border border-line"
                                  : "opacity-30 cursor-not-allowed border border-line"
                          }`}>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ backgroundColor: col }}>
                              ✓
                            </div>
                          )}
                          {isLocked && (
                            <div className="absolute top-2 right-2 text-muted text-[12px]">🔒</div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-extrabold text-lg shrink-0"
                              style={{ backgroundColor: col }}>
                              {ln}
                            </span>
                            <span className="font-bold text-brand-deep text-sm">{name}</span>
                          </div>
                          {desc && <p className="text-[12px] text-ink-soft mb-3 leading-snug line-clamp-2">{desc}</p>}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted">{s.total} items</span>
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

              {/* Step 4 — Evidence items table */}
              {selDomain && selStandard && selLevel !== null && (
                <section>
                  {selectedQuestion && (
                    <div className="mb-4 p-4 bg-canvas-soft rounded-xl border border-line">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono font-bold text-muted">{selStandard}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: lvlColor(selLevel) }}>
                          Level {selLevel} · {lvlName(selLevel)}
                        </span>
                      </div>
                      <p className="text-sm text-ink leading-relaxed text-right" dir="rtl">{selectedQuestion}</p>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-[12px] text-muted flex-wrap">
                      <span className="text-emerald-600 font-semibold">
                        {questionsForView.filter((r) => r.submissionStatus === "COMPLETE").length} complete
                      </span>
                      <span className="text-amber-600 font-semibold">
                        {questionsForView.filter((r) => r.submissionStatus === "NOT_COMPLETE").length} not completed
                      </span>
                      <span className="text-gray-500">
                        {questionsForView.filter((r) => r.submissionStatus === "NA").length} N/A
                      </span>
                      <span className="text-muted">· {questionsForView.length} evidence items</span>
                    </div>
                    <button
                      onClick={() => backToLevels()}
                      className="text-[11px] text-brand-purple hover:underline font-medium">
                      ← Change Level
                    </button>
                  </div>

                  {questionsForView.length === 0 ? (
                    <div className="card p-10 text-center text-ink-soft text-sm">No evidence items at this level.</div>
                  ) : (
                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1200px]">
                          <thead>
                            <tr className="border-b border-line bg-canvas-soft text-left">
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Code</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Supporting Evidence</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">Type</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Evident Admin</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Domain Owner</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Status</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24">Workflow</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24">Evidence</th>
                              <th className="px-3 py-2.5 w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {questionsForView.map((req) => (
                              <>
                                <tr key={req.reqId}
                                  className={`border-b border-line-soft ${saving.has(req.reqId) ? "opacity-50" : "hover:bg-canvas/40"}`}>
                                  {/* Code */}
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-1.5">
                                      {req.workflowStatus === "ENDORSED" && (
                                        <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                                          title="Endorsed">✓</span>
                                      )}
                                      <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded text-white"
                                        style={{ backgroundColor: lvlColor(selLevel) }}>
                                        {req.reqCode}
                                      </span>
                                    </div>
                                    {req.directoryType && (
                                      <div className="text-[10px] text-muted mt-1">{req.directoryType}</div>
                                    )}
                                  </td>

                                  {/* Supporting Evidence */}
                                  <td className="px-3 py-3">
                                    <div className="text-[13px] text-ink leading-snug text-right" dir="rtl">
                                      {req.supportingEvidence || <span className="text-muted italic">—</span>}
                                    </div>
                                  </td>

                                  {/* Type */}
                                  <td className="px-3 py-3">
                                    {req.complianceOrMaturity && (
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                        req.complianceOrMaturity.includes("امتثال") || req.complianceOrMaturity.toLowerCase().includes("compliance")
                                          ? "bg-blue-100 text-blue-700"
                                          : "bg-purple-100 text-purple-700"
                                      }`}>
                                        {req.complianceOrMaturity}
                                      </span>
                                    )}
                                  </td>

                                  {/* Evident Admin */}
                                  <td className="px-3 py-3">
                                    <UserPicker
                                      value={req.evidentAdminOverride ?? req.evidentAdministrator ?? ""}
                                      users={users}
                                      placeholder="Assign admin"
                                      onSave={(v) => patch(req, { evidentAdminOverride: v || null })}
                                    />
                                  </td>

                                  {/* Domain Owner */}
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

                                  {/* Workflow */}
                                  <td className="px-3 py-3">
                                    <WorkflowActions
                                      req={req}
                                      role={currentUser.role}
                                      onAdvance={(action) => advanceWorkflow(req, action)}
                                    />
                                  </td>

                                  {/* Evidence file */}
                                  <td className="px-3 py-3">
                                    <label className="relative cursor-pointer block">
                                      {req.evidenceName ? (
                                        <a
                                          href={`/api/governance/compliance/${fwId}/evidence/${req.reqId}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-brand-purple text-[11px] truncate max-w-[80px] block hover:underline"
                                          title={req.evidenceName}>
                                          {req.evidenceName.length > 12 ? req.evidenceName.slice(0,10) + "…" : req.evidenceName}
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
                                    <button
                                      onClick={() => setExpanded(expanded === req.reqId ? null : req.reqId)}
                                      className="text-muted/60 hover:text-ink text-xs leading-none">
                                      {expanded === req.reqId ? "▲" : "▼"}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded detail */}
                                {expanded === req.reqId && (
                                  <tr key={`${req.reqId}-exp`} className="border-b border-line-soft bg-canvas-soft/60">
                                    <td colSpan={9} className="px-5 py-4">
                                      <EvidenceExpanded
                                        req={req}
                                        fwId={fwId ?? 0}
                                        onPatch={(updates) => patch(req, updates)}
                                        onTranslate={translateText}
                                        translations={translations}
                                      />
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

      {/* ── Config tab ──────────────────────────────────────────────────────── */}
      {activeTab === "config" && (
        <ConfigTab
          levelCfg={levelCfg}
          configItems={configItems}
          frameworkId={fwId ?? 0}
          onSaveLevels={saveCfg}
          saving={cfgSaving}
          onConfigItemsChange={setConfigItems}
        />
      )}

      {/* ── Admin tab ───────────────────────────────────────────────────────── */}
      {activeTab === "admin" && (
        <AdminTab
          frameworkId={fwId ?? 0}
          users={users}
        />
      )}
    </div>
  );
}

// ── Evidence expanded row ─────────────────────────────────────────────────────

function EvidenceExpanded({
  req, fwId, onPatch, onTranslate, translations,
}: {
  req: ComplianceRequirement;
  fwId: number;
  onPatch: (updates: Partial<ComplianceRequirement>) => void;
  onTranslate: (text: string) => Promise<string | null>;
  translations: Record<string, string>;
}) {
  const [mgmt,      setMgmt]      = useState(req.managementNotes ?? req.managementSector ?? "");
  const [comments,  setComments]  = useState(req.comments ?? "");
  const [saving,    setSaving]    = useState(false);
  const [showCollab, setShowCollab] = useState(false);

  useEffect(() => { setMgmt(req.managementNotes ?? req.managementSector ?? ""); }, [req.managementNotes, req.managementSector]);
  useEffect(() => { setComments(req.comments ?? ""); }, [req.comments]);

  const isDirty = mgmt !== (req.managementNotes ?? req.managementSector ?? "") ||
                  comments !== (req.comments ?? "");

  async function saveAll() {
    setSaving(true);
    await onPatch({ managementNotes: mgmt || null, comments: comments || null });
    setSaving(false);
  }

  return (
    <div>
      {/* Static fields */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[12px] mb-4">
        {req.admissionCriteria && (
          <ArabicField label="Admission Criteria" value={req.admissionCriteria}
            onTranslate={onTranslate} translations={translations} />
        )}
        {req.directoryCode && <Field label="Evidence Code" value={req.directoryCode} />}
        {req.directoryType && <Field label="Evidence Type" value={req.directoryType} />}
        {req.operationalExcellence && req.operationalExcellence !== "N/A" && req.operationalExcellence !== "لا" && (
          <Field label="Operational Excellence" value={req.operationalExcellence} />
        )}
      </div>

      {/* Management & Supporting Sector */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold text-ink-soft mb-1">
          Management &amp; Supporting Sector
        </label>
        {req.managementSector && !req.managementNotes && (
          <div className="text-[11px] text-muted/70 bg-canvas border border-line rounded-md px-2 py-1.5 mb-1.5 text-right" dir="rtl">
            {req.managementSector}
            <span className="ml-2 text-[10px] text-muted italic">(imported value)</span>
          </div>
        )}
        <textarea value={mgmt} onChange={(e) => setMgmt(e.target.value)} rows={2}
          className="field text-[12px] w-full"
          placeholder="Enter management & supporting sector notes…" />
      </div>

      {/* Comments */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold text-ink-soft mb-1">Comments</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
          className="field text-[12px] w-full" placeholder="Add comments…" />
      </div>

      {/* Save All button */}
      {isDirty && (
        <div className="mb-4">
          <button onClick={saveAll} disabled={saving}
            className="btn btn-sm btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* Collaboration */}
      <div className="mb-4">
        <button onClick={() => setShowCollab((v) => !v)}
          className="flex items-center gap-2 text-[12px] font-semibold text-brand-purple hover:text-brand-deep transition-colors">
          <ChatIcon />
          {showCollab ? "Hide" : "Show"} Discussion
        </button>
        {showCollab && (
          <div className="mt-2">
            <CollabPanel reqId={req.reqId} fwId={fwId} />
          </div>
        )}
      </div>

      {/* Change history — auto-loads on expand */}
      <HistoryPanel reqId={req.reqId} fwId={fwId} />
    </div>
  );
}

// ── Workflow actions ──────────────────────────────────────────────────────────

function WorkflowActions({
  req, role, onAdvance,
}: {
  req: ComplianceRequirement;
  role: string;
  onAdvance: (action: "submit"|"confirm"|"endorse") => void;
}) {
  const status = req.workflowStatus ?? "DRAFT";
  const meta   = WORKFLOW_META[status] ?? WORKFLOW_META.DRAFT;

  const canSubmit  = status === "DRAFT"     && role !== "VIEWER";
  const canConfirm = status === "SUBMITTED" && (role === "ADMIN" || role === "STEWARD");
  const canEndorse = status === "CONFIRMED" && role === "ADMIN";

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ color: meta.color, backgroundColor: meta.bg }}>
        {meta.label}
      </span>
      {canSubmit  && (
        <button onClick={() => onAdvance("submit")}
          className="text-[10px] text-amber-700 hover:text-amber-900 font-semibold underline">
          Submit
        </button>
      )}
      {canConfirm && (
        <button onClick={() => onAdvance("confirm")}
          className="text-[10px] text-blue-700 hover:text-blue-900 font-semibold underline">
          Confirm
        </button>
      )}
      {canEndorse && (
        <button onClick={() => onAdvance("endorse")}
          className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold underline">
          Endorse
        </button>
      )}
    </div>
  );
}

// ── Collab panel ──────────────────────────────────────────────────────────────

function CollabPanel({ reqId, fwId }: { reqId: number; fwId: number }) {
  const [threads, setThreads]     = useState<CollabThread[] | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [title, setTitle]         = useState("");
  const [body, setBody]           = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/governance/compliance/${fwId}/collab/${reqId}`)
      .then((r) => r.json())
      .then((d) => { setThreads(d.threads ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reqId, fwId]);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/governance/compliance/${fwId}/collab/${reqId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setThreads((t) => [{
        threadId: data.threadId, title: title.trim(), status: "OPEN",
        createdBy: "", createdAt: new Date().toISOString(), messageCount: 1,
      }, ...(t ?? [])]);
      setTitle(""); setBody(""); setShowForm(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="px-3 py-2.5 bg-canvas-soft border-b border-line flex items-center justify-between">
        <span className="text-[11px] font-semibold text-ink-soft">Discussions</span>
        <button onClick={() => setShowForm((v) => !v)}
          className="text-[10px] font-semibold text-brand-purple hover:text-brand-deep">
          + Start Discussion
        </button>
      </div>

      {showForm && (
        <div className="px-3 py-3 border-b border-line-soft bg-white space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Discussion title…" className="field text-[12px] w-full" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)}
            rows={2} placeholder="What would you like to discuss?" className="field text-[12px] w-full" />
          <div className="flex gap-2">
            <button onClick={submit} disabled={submitting || !title.trim() || !body.trim()}
              className="btn btn-sm btn-primary text-[11px]">
              {submitting ? "Posting…" : "Post"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn btn-sm text-[11px]">Cancel</button>
          </div>
        </div>
      )}

      {loading && <div className="px-4 py-3 text-[12px] text-muted italic">Loading…</div>}
      {!loading && threads !== null && threads.length === 0 && (
        <div className="px-4 py-3 text-[12px] text-muted italic">No discussions yet.</div>
      )}
      {!loading && threads !== null && threads.length > 0 && threads.map((t) => (
        <div key={t.threadId} className="px-3 py-2.5 border-b border-line-soft last:border-0 flex items-start gap-2">
          <ChatIcon className="text-brand-purple mt-0.5 shrink-0" />
          <div className="min-w-0">
            <a href={`/collaboration/${t.threadId}`} target="_blank"
              className="text-[12px] font-semibold text-ink hover:text-brand-purple truncate block">
              {t.title}
            </a>
            <span className="text-[10px] text-muted">{t.messageCount} message{t.messageCount !== 1 ? "s" : ""} · {fmtDate(t.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── History panel (auto-loads on mount) ───────────────────────────────────────

function HistoryPanel({ reqId, fwId }: { reqId: number; fwId: number }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow]       = useState(false);

  useEffect(() => {
    fetch(`/api/governance/compliance/${fwId}/history/${reqId}`)
      .then((r) => r.json())
      .then((d) => { setHistory(d.history ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reqId, fwId]);

  return (
    <div>
      <button
        onClick={() => setShow((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-purple hover:text-brand-deep transition-colors mb-2">
        <span>{show ? "▲" : "▼"}</span>
        Change History {history !== null ? `(${history.length})` : loading ? "…" : ""}
      </button>

      {show && (
        <div className="border border-line rounded-lg overflow-hidden">
          {loading && <div className="px-4 py-3 text-[12px] text-muted italic">Loading history…</div>}
          {!loading && history !== null && history.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-muted italic">No changes recorded yet.</div>
          )}
          {!loading && history !== null && history.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-canvas-soft border-b border-line text-left">
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">Field</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">Previous</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">New Value</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.historyId} className="border-b border-line-soft hover:bg-canvas/30">
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtDate(h.changedAt)}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{h.fieldLabel}</td>
                    <td className="px-3 py-2 text-muted/80 max-w-[160px] truncate" title={h.oldValue ?? ""}>
                      {h.oldValue
                        ? <span className="line-through">{h.oldValue.length > 35 ? h.oldValue.slice(0,33)+"…" : h.oldValue}</span>
                        : <span className="italic text-muted/50">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink max-w-[160px] truncate" title={h.newValue ?? ""}>
                      {h.newValue
                        ? (h.newValue.length > 35 ? h.newValue.slice(0,33)+"…" : h.newValue)
                        : <span className="italic text-muted/50">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">
                      {h.changedByName ?? h.changedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Configuration tab ─────────────────────────────────────────────────────────

function ConfigTab({
  levelCfg, configItems, frameworkId, onSaveLevels, saving, onConfigItemsChange,
}: {
  levelCfg: LevelConfig[];
  configItems: ConfigItem[];
  frameworkId: number;
  onSaveLevels: (r: LevelConfig[]) => void;
  saving: boolean;
  onConfigItemsChange: (items: ConfigItem[]) => void;
}) {
  const [rows, setRows] = useState<LevelConfig[]>(levelCfg);
  const dirty = JSON.stringify(rows) !== JSON.stringify(levelCfg);

  function update(levelNum: number, field: keyof LevelConfig, val: string) {
    setRows((p) => p.map((r) => r.levelNum === levelNum ? { ...r, [field]: val } : r));
  }

  return (
    <div className="space-y-10">
      {/* Level config */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-brand-deep">Level Configuration</h2>
            <p className="text-sm text-ink-soft">Customise names, colours, and descriptions for each maturity level.</p>
          </div>
          {dirty && (
            <button onClick={() => onSaveLevels(rows)} disabled={saving} className="btn btn-primary btn-sm">
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
                      style={{ backgroundColor: row.colorHex }}>{row.levelNum}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="color" value={row.colorHex}
                      onChange={(e) => update(row.levelNum, "colorHex", e.target.value)}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-line p-0.5" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input value={row.name} onChange={(e) => update(row.levelNum, "name", e.target.value)}
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

      {/* Configurable lists */}
      {(["STATUS","EVIDENCE_TYPE","COMPLIANCE_TYPE"] as const).map((group) => (
        <ConfigItemsSection
          key={group}
          group={group}
          frameworkId={frameworkId}
          items={configItems.filter((i) => i.configGroup === group)}
          onUpdate={(updated) => {
            const others = configItems.filter((i) => i.configGroup !== group);
            onConfigItemsChange([...others, ...updated]);
          }}
        />
      ))}
    </div>
  );
}

const GROUP_LABELS: Record<string, string> = {
  STATUS:          "Submission Statuses",
  EVIDENCE_TYPE:   "Evidence Types",
  COMPLIANCE_TYPE: "Compliance Types",
};

function ConfigItemsSection({
  group, frameworkId, items, onUpdate,
}: {
  group: string; frameworkId: number; items: ConfigItem[];
  onUpdate: (items: ConfigItem[]) => void;
}) {
  const [showAdd, setShowAdd]     = useState(false);
  const [addCode, setAddCode]     = useState("");
  const [addLabel, setAddLabel]   = useState("");
  const [addLabelAr, setAddLabelAr] = useState("");
  const [addColor, setAddColor]   = useState("#6B7280");
  const [adding, setAdding]       = useState(false);

  async function save() {
    setAdding(true);
    await fetch(`/api/governance/compliance/${frameworkId}/config-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configGroup: group, code: addCode.trim(), label: addLabel.trim(),
        labelAr: addLabelAr.trim() || null, colorHex: addColor, sortOrder: items.length + 1,
      }),
    });
    const newItem: ConfigItem = {
      itemId: Date.now(), configGroup: group, code: addCode.trim(),
      label: addLabel.trim(), labelAr: addLabelAr.trim() || null,
      colorHex: addColor, sortOrder: items.length + 1,
    };
    onUpdate([...items, newItem]);
    setAddCode(""); setAddLabel(""); setAddLabelAr(""); setAddColor("#6B7280");
    setShowAdd(false); setAdding(false);
  }

  async function del(code: string) {
    await fetch(`/api/governance/compliance/${frameworkId}/config-items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configGroup: group, code }),
    });
    onUpdate(items.filter((i) => i.code !== code));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-bold text-brand-deep">{GROUP_LABELS[group]}</h2>
          <p className="text-sm text-ink-soft">Configure the list values used in this framework.</p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="btn btn-sm">
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 mb-4 bg-canvas-soft/50 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Code</label>
              <input value={addCode} onChange={(e) => setAddCode(e.target.value)}
                className="field text-sm w-full" placeholder="CODE_VALUE" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN)</label>
              <input value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
                className="field text-sm w-full" placeholder="English label" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (AR)</label>
              <input value={addLabelAr} onChange={(e) => setAddLabelAr(e.target.value)}
                className="field text-sm w-full text-right" dir="rtl" placeholder="التسمية بالعربية" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Colour</label>
              <input type="color" value={addColor} onChange={(e) => setAddColor(e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border border-line p-0.5" />
            </div>
            <button onClick={save} disabled={adding || !addCode.trim() || !addLabel.trim()}
              className="btn btn-sm btn-primary mt-4">
              {adding ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas-soft text-left">
              <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-16">Colour</th>
              <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-40">Code</th>
              <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Label (EN)</th>
              <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Label (AR)</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {items.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
              <tr key={item.code} className="border-b border-line-soft hover:bg-canvas/30">
                <td className="px-4 py-2.5">
                  <span className="w-5 h-5 rounded-full inline-block border border-line"
                    style={{ backgroundColor: item.colorHex ?? "#6B7280" }} />
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{item.code}</td>
                <td className="px-4 py-2.5 font-semibold text-ink">{item.label}</td>
                <td className="px-4 py-2.5 text-ink text-right" dir="rtl">{item.labelAr ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => del(item.code)}
                    className="text-[10px] text-red-500 hover:text-red-700 font-semibold">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted italic">No items configured.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Administration tab ────────────────────────────────────────────────────────

function AdminTab({ frameworkId, users }: { frameworkId: number; users: UserOption[] }) {
  const [reqs, setReqs]         = useState<ComplianceRequirement[] | null>(null);
  const [loading, setLoading]   = useState(false);
  const [q, setQ]               = useState("");
  const [editing, setEditing]   = useState<ComplianceRequirement | null>(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/governance/compliance/${frameworkId}/admin/requirements`)
      .then((r) => r.json())
      .then((d) => { setReqs(d.requirements ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [frameworkId]);

  const filtered = useMemo(() => {
    if (!reqs) return [];
    const lq = q.toLowerCase();
    if (!lq) return reqs;
    return reqs.filter(
      (r) => r.reqCode.toLowerCase().includes(lq) ||
             r.question.toLowerCase().includes(lq) ||
             (r.domain ?? "").toLowerCase().includes(lq) ||
             (r.standard ?? "").toLowerCase().includes(lq)
    );
  }, [reqs, q]);

  async function saveEdit(req: ComplianceRequirement, updates: Partial<ComplianceRequirement>) {
    setSaving(true);
    await fetch(`/api/governance/compliance/${frameworkId}/admin/requirements/${req.reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setReqs((p) => p ? p.map((r) => r.reqId === req.reqId ? { ...r, ...updates } : r) : p);
    setSaving(false);
    setEditing(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-brand-deep">Requirements Administration</h2>
          <p className="text-sm text-ink-soft">Edit requirement details, evidence codes, and assignments.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          className="field text-sm w-72" placeholder="Search requirements…" />
      </div>

      {loading && <div className="card p-8 text-center text-muted text-sm">Loading requirements…</div>}

      {!loading && reqs !== null && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-line bg-canvas-soft text-left">
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Code</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24">Standard</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Domain</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Question</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">Level</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((req) => (
                  <tr key={req.reqId} className="border-b border-line-soft hover:bg-canvas/30">
                    <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-muted">{req.reqCode}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted">{req.standard ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink">{req.domain ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-soft max-w-[340px] truncate text-right" dir="rtl" title={req.question}>
                      {req.question.length > 80 ? req.question.slice(0,78)+"…" : req.question}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted">{req.maturityLevel ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setEditing(req)}
                        className="text-[11px] text-brand-purple hover:text-brand-deep font-semibold">Edit</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted italic">No requirements match.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <div className="px-4 py-2 text-[11px] text-muted text-center border-t border-line">
                Showing first 200 of {filtered.length} results. Refine your search to see more.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editing && (
        <EditRequirementDialog
          req={editing}
          users={users}
          saving={saving}
          onSave={(updates) => saveEdit(editing, updates)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditRequirementDialog({
  req, users, saving, onSave, onClose,
}: {
  req: ComplianceRequirement;
  users: UserOption[];
  saving: boolean;
  onSave: (updates: Partial<ComplianceRequirement>) => void;
  onClose: () => void;
}) {
  const [vals, setVals] = useState({
    question:             req.question,
    supportingEvidence:   req.supportingEvidence ?? "",
    admissionCriteria:    req.admissionCriteria  ?? "",
    directoryCode:        req.directoryCode       ?? "",
    directoryType:        req.directoryType       ?? "",
    complianceOrMaturity: req.complianceOrMaturity ?? "",
    evidentAdministrator: req.evidentAdministrator ?? "",
    domainOwner:          req.domainOwner          ?? "",
    managementSector:     req.managementSector     ?? "",
    maturityLevel:        req.maturityLevel        ?? "",
  });

  function set(field: keyof typeof vals, v: string) {
    setVals((p) => ({ ...p, [field]: v }));
  }

  function save() {
    const updates: Partial<ComplianceRequirement> = {};
    (Object.keys(vals) as Array<keyof typeof vals>).forEach((k) => {
      const v = vals[k].trim();
      if (v !== ((req[k as keyof ComplianceRequirement] as string | null) ?? "").trim()) {
        (updates as Record<string, string>)[k] = v || null as unknown as string;
      }
    });
    onSave(updates);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-brand-deep">Edit Requirement</h3>
            <p className="text-[11px] text-muted font-mono">{req.reqCode}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <EditField label="Question (Arabic)" value={vals.question} onChange={(v) => set("question", v)} multiline rtl />
          <EditField label="Supporting Evidence (Arabic)" value={vals.supportingEvidence} onChange={(v) => set("supportingEvidence", v)} multiline rtl />
          <EditField label="Admission Criteria (Arabic)" value={vals.admissionCriteria} onChange={(v) => set("admissionCriteria", v)} multiline rtl />
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Evidence Code" value={vals.directoryCode} onChange={(v) => set("directoryCode", v)} />
            <EditField label="Evidence Type" value={vals.directoryType} onChange={(v) => set("directoryType", v)} />
            <EditField label="Compliance or Maturity" value={vals.complianceOrMaturity} onChange={(v) => set("complianceOrMaturity", v)} />
            <EditField label="Maturity Level" value={vals.maturityLevel} onChange={(v) => set("maturityLevel", v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Evident Administrator" value={vals.evidentAdministrator} onChange={(v) => set("evidentAdministrator", v)} />
            <EditField label="Domain Owner" value={vals.domainOwner} onChange={(v) => set("domainOwner", v)} />
          </div>
          <EditField label="Management & Supporting Sector" value={vals.managementSector} onChange={(v) => set("managementSector", v)} multiline />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 flex gap-3 justify-end rounded-b-2xl">
          <button onClick={onClose} className="btn btn-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-sm btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, multiline, rtl }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; rtl?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
          dir={rtl ? "rtl" : undefined} className="field text-sm w-full" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          dir={rtl ? "rtl" : undefined} className="field text-sm w-full" />
      )}
    </div>
  );
}

// ── Arabic field with translate button ────────────────────────────────────────

function ArabicField({ label, value, onTranslate, translations }: {
  label: string; value: string;
  onTranslate: (text: string) => Promise<string | null>;
  translations: Record<string, string>;
}) {
  const [loading, setLoading] = useState(false);
  const cached = translations[value];

  async function translate() {
    setLoading(true);
    await onTranslate(value);
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</span>
        {!cached && (
          <button onClick={translate} disabled={loading}
            className="text-[10px] text-brand-purple hover:text-brand-deep font-semibold disabled:opacity-50">
            {loading ? "…" : "🌐 Translate"}
          </button>
        )}
      </div>
      <div className="text-ink text-[12px] leading-snug text-right" dir="rtl">{value}</div>
      {cached && (
        <div className="text-muted text-[11px] mt-1 italic border-l-2 border-brand-purple/30 pl-2">
          {cached}
        </div>
      )}
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
    const lq = search.toLowerCase();
    return users.filter((u) => !lq || u.fullName?.toLowerCase().includes(lq) || u.email.toLowerCase().includes(lq)).slice(0, 12);
  }, [users, search]);

  if (!editing) {
    return (
      <button onClick={() => { setSearch(""); setEditing(true); }}
        className="text-[12px] text-left w-full truncate block text-ink hover:text-brand-purple transition-colors">
        {value
          ? <span className="flex items-center gap-1.5"><UserIcon />{value}</span>
          : <span className="text-muted/50 italic">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div className="relative z-50">
      <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        className="field text-[12px] py-0.5 px-1.5 w-full" placeholder="Search users…" />
      <div className="absolute top-full left-0 mt-0.5 w-56 bg-white rounded-lg shadow-xl border border-line overflow-hidden z-50">
        <button onMouseDown={() => { onSave(""); setEditing(false); }}
          className="w-full text-left px-3 py-2 text-[11px] text-muted/70 italic hover:bg-canvas border-b border-line-soft">
          — Remove assignment
        </button>
        {filtered.length === 0 && search && (
          <div className="px-3 py-2 text-[12px] text-muted">No users found</div>
        )}
        {filtered.map((u) => (
          <button key={u.userId} onMouseDown={() => { onSave(u.fullName ?? u.email); setEditing(false); }}
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

const STATUSES = [
  { code: "NOT_COMPLETE", label: "Not Completed", hex: "#F59E0B" },
  { code: "COMPLETE",     label: "Complete",      hex: "#10B981" },
  { code: "NA",           label: "N/A",           hex: "#6B7280" },
];

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const s = STATUSES.find((x) => x.code === value) ?? STATUSES[0];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 cursor-pointer appearance-none pr-6"
      style={{
        backgroundColor: `${s.hex}20`,
        color: s.hex,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23${s.hex.slice(1)}'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}>
      {STATUSES.map((st) => (
        <option key={st.code} value={st.code}>{st.label}</option>
      ))}
    </select>
  );
}

// ── Small shared components ───────────────────────────────────────────────────

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

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 ${className ?? "text-muted"}`}>
      <path d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11l3 2V4a2 2 0 0 0-2-2H2zm0 1h12a1 1 0 0 1 1 1v9l-2-1.4V13a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}
