"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  ComplianceFramework, ComplianceRequirement,
  LevelConfig, UserOption, ConfigItem, MaturitySelection, DomainConfig,
} from "@/lib/queries/gov-compliance";
import type { SessionUser } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = {
  frameworks: ComplianceFramework[]; activeFramework: ComplianceFramework | null;
  initialRequirements: ComplianceRequirement[]; initialLevelConfig: LevelConfig[];
  users: UserOption[]; initialMaturitySelections: MaturitySelection[];
  initialConfigItems: ConfigItem[]; initialDomainConfig: DomainConfig[];
  currentUser: SessionUser;
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

// Fallback English names keyed by NDI domain code (used when domainEn is null in DB)
const DOMAIN_EN_BY_CODE: Record<string, string> = {
  DG:  "Data Governance",
  DSI: "Data Sharing",
  RMD: "Master Data",
  DQ:  "Data Quality",
  BIA: "BI & Analytics",
  DAM: "Data Modeling",
  MCM: "Data Catalog",
  DVR: "Data Value",
  OD:  "Open Data",
  DC:  "Classification",
  FOI: "FOI Requests",
  DO:  "Data Operations",
  DCM: "Content Mgmt.",
  PDP: "Data Privacy",
};
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
  if (req.standardCode?.trim()) return req.standardCode.trim();
  return req.domainCode ?? "General";
}
function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}
function hasArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}
function complianceTypeLabel(raw: string | null | undefined): { label: string; isCompliance: boolean } | null {
  if (!raw) return null;
  const isCompliance = raw.includes("امتثال") || raw.toLowerCase().includes("compliance");
  const isMaturity   = raw.includes("نضج")    || raw.toLowerCase().includes("maturity");
  if (!isCompliance && !isMaturity) return null;
  return { label: isCompliance ? "Compliance" : "Maturity", isCompliance };
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function ComplianceClient({
  frameworks, activeFramework, initialRequirements, initialLevelConfig,
  users, initialMaturitySelections, initialConfigItems, initialDomainConfig, currentUser,
}: Props) {
  const router = useRouter();
  const { isRtl, t } = useLang();
  const ca = t.governance.ca;
  const [reqs, setReqs]                 = useState<ComplianceRequirement[]>(initialRequirements);
  const [levelCfg, setLevelCfg]         = useState<LevelConfig[]>(initialLevelConfig);
  const [configItems, setConfigItems]   = useState<ConfigItem[]>(initialConfigItems);
  const [domainConfig, setDomainConfig] = useState<DomainConfig[]>(initialDomainConfig);
  const [maturitySels, setMaturitySels] = useState<Record<string, number>>(
    Object.fromEntries(initialMaturitySelections.map((s) => [s.standardCode, s.selectedLevel]))
  );
  const [selDomain, setSelDomain]       = useState<string | null>(null);
  const [selStandard, setSelStandard]   = useState<string | null>(null);
  const [selLevel, setSelLevel]         = useState<number | null>(null);
  const [saving, setSaving]             = useState<Set<number>>(new Set());
  const [expanded, setExpanded]         = useState<number | null>(null);
  const [importing, setImporting]       = useState(false);
  const [importMsg, setImportMsg]       = useState("");
  const [levelWarning, setLevelWarning] = useState<{ std: string; newLevel: number } | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [collabCounts, setCollabCounts] = useState<Record<string, number>>({});
  const [toastMsg, setToastMsg]         = useState("");
  const pendingTrans = useRef(new Set<string>());
  const importRef = useRef<HTMLInputElement>(null);
  const fwId = activeFramework?.frameworkId;

  const lvlColor = (n: number) => levelCfg.find((c) => c.levelNum === n)?.colorHex ?? DEFAULT_LEVEL_COLORS[n] ?? "#888";
  const lvlName  = (n: number) => {
    const cfg = levelCfg.find((c) => c.levelNum === n);
    if (isRtl && cfg?.nameAr) return cfg.nameAr;
    return cfg?.name ?? DEFAULT_LEVEL_NAMES[n] ?? `Level ${n}`;
  };
  const lvlDesc  = (n: number) => {
    const cfg = levelCfg.find((c) => c.levelNum === n);
    if (isRtl && cfg?.descriptionAr) return cfg.descriptionAr;
    return cfg?.description ?? "";
  };

  // Helper: show a toast then hide after 4s
  function toast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  }

  // ── Language helper ──────────────────────────────────────────────────────────
  function disp(en: string | null | undefined, ar: string | null | undefined): string {
    return isRtl ? (ar ?? en ?? "") : (en ?? ar ?? "");
  }

  // ── Data derived ────────────────────────────────────────────────────────────
  // Map Arabic domain key → English/Arabic display names (from domainConfig → fallbacks)
  const domainEnMap = useMemo(() => {
    const map = new Map<string, string>();
    const cfgByCode = new Map(domainConfig.map((d) => [d.domainCode, d]));
    reqs.forEach((r) => {
      const key = r.domain ?? "Other";
      if (!map.has(key)) {
        const cfg = cfgByCode.get(r.domainCode ?? "");
        map.set(key, cfg?.nameEn ?? r.domainEn ?? DOMAIN_EN_BY_CODE[r.domainCode ?? ""] ?? key);
      }
    });
    return map;
  }, [reqs, domainConfig]);

  const domainArMap = useMemo(() => {
    const map = new Map<string, string>();
    const cfgByCode = new Map(domainConfig.map((d) => [d.domainCode, d]));
    reqs.forEach((r) => {
      const key = r.domain ?? "Other";
      if (!map.has(key)) {
        const cfg = cfgByCode.get(r.domainCode ?? "");
        map.set(key, cfg?.nameAr ?? key);
      }
    });
    return map;
  }, [reqs, domainConfig]);

  const domains = useMemo(() => {
    const s = new Set(reqs.map((r) => r.domain ?? "Other"));
    return Array.from(s).sort((a, b) =>
      (domainEnMap.get(a) ?? a).localeCompare(domainEnMap.get(b) ?? b)
    );
  }, [reqs, domainEnMap]);

  const standards = useMemo(() => {
    if (!selDomain) return [];
    const seen = new Map<string, ComplianceRequirement>();
    reqs.filter((r) => (r.domain ?? "Other") === selDomain)
        .forEach((r) => { const k = deriveStandard(r); if (!seen.has(k)) seen.set(k, r); });
    return Array.from(seen.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([std, rep]) => ({
        std,
        question: isRtl ? (rep.question ?? rep.questionEn ?? "") : (rep.questionEn ?? rep.question ?? ""),
      }));
  }, [reqs, selDomain, isRtl]);

  // Cumulative: level 0 → only lvl 0; level N≥1 → levels 1..N
  const questionsForView = useMemo(() => {
    if (selLevel === null) return [];
    return reqs.filter((r) => {
      if ((r.domain ?? "Other") !== selDomain) return false;
      if (selStandard && deriveStandard(r) !== selStandard) return false;
      const lvl = parseLevelNum(r.maturityLevel);
      if (lvl === null) return false;
      if (selLevel === 0) return lvl === 0;
      return lvl >= 1 && lvl <= selLevel;
    }).sort((a, b) => {
      const la = parseLevelNum(a.maturityLevel) ?? 0;
      const lb = parseLevelNum(b.maturityLevel) ?? 0;
      return la !== lb ? la - lb : a.sortOrder - b.sortOrder;
    });
  }, [reqs, selDomain, selStandard, selLevel]);

  const overallStats = useMemo(() => {
    const total    = reqs.length;
    const complete = reqs.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na       = reqs.filter((r) => r.submissionStatus === "NA").length;
    const notDone  = total - complete - na;
    const pct      = Math.round(((complete + na) / Math.max(total, 1)) * 100);
    return { total, complete, na, notDone, pct };
  }, [reqs]);

  const statusConfigItems = useMemo(
    () => configItems.filter((i) => i.configGroup === "STATUS"),
    [configItems]
  );

  const complianceTypeMap = useMemo(() => {
    const map = new Map<string, ConfigItem>();
    configItems.filter((i) => i.configGroup === "COMPLIANCE_TYPE").forEach((item) => {
      map.set(item.label, item);
      if (item.labelAr) map.set(item.labelAr, item);
      map.set(item.code, item);
    });
    return map;
  }, [configItems]);

  function domainStats(domain: string) {
    const d = reqs.filter((r) => (r.domain ?? "Other") === domain);
    const c = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c+na)/Math.max(d.length,1))*100) };
  }
  function standardStats(domain: string, std: string) {
    const d = reqs.filter((r) => (r.domain ?? "Other") === domain && deriveStandard(r) === std);
    const c = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c+na)/Math.max(d.length,1))*100) };
  }
  // Cumulative stats for level picker card
  function levelStats(domain: string | null, std: string | null, ln: number) {
    const d = reqs.filter((r) => {
      if (domain && (r.domain ?? "Other") !== domain) return false;
      if (std    && deriveStandard(r) !== std) return false;
      const lvl = parseLevelNum(r.maturityLevel);
      if (lvl === null) return false;
      if (ln === 0) return lvl === 0;
      return lvl >= 1 && lvl <= ln;
    });
    const c = d.filter((r) => r.submissionStatus === "COMPLETE").length;
    const na = d.filter((r) => r.submissionStatus === "NA").length;
    return { total: d.length, complete: c, na, pct: Math.round(((c+na)/Math.max(d.length,1))*100) };
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function selectDomain(d: string)   { setSelDomain(d); setSelStandard(null); setSelLevel(null); setExpanded(null); }
  function selectStandard(s: string) { setSelStandard(s); setSelLevel(null); setExpanded(null); }
  function resetAll()                { setSelDomain(null); setSelStandard(null); setSelLevel(null); setExpanded(null); }
  function backToStandards()         { setSelStandard(null); setSelLevel(null); setExpanded(null); }
  function backToLevels()            { setSelLevel(null); setExpanded(null); }

  // ── Auto-translate visible Arabic text ──────────────────────────────────────
  const autoTranslate = useCallback(async (texts: string[]) => {
    if (!fwId) return;
    const unique = [...new Set(
      texts.filter((t) => t && hasArabic(t) && !pendingTrans.current.has(t))
    )].filter((t) => !translations[t]);
    if (unique.length === 0) return;
    unique.forEach((t) => pendingTrans.current.add(t));
    // Batch in groups of 6
    for (let i = 0; i < unique.length; i += 6) {
      await Promise.all(unique.slice(i, i + 6).map(async (text) => {
        try {
          const r = await fetch(`/api/governance/compliance/${fwId}/translate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const d = await r.json();
          if (d.translation) setTranslations((p) => ({ ...p, [text]: d.translation }));
        } catch {}
        pendingTrans.current.delete(text);
      }));
    }
  }, [fwId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Translate standard questions when domain shown (step 2)
  useEffect(() => {
    if (!selDomain || selStandard) return;
    autoTranslate(standards.map((s) => s.question).filter(Boolean) as string[]);
  }, [selDomain, selStandard, standards.length]); // eslint-disable-line

  // Translate question + evidence texts when evidence table shown (step 4)
  useEffect(() => {
    if (selLevel === null || questionsForView.length === 0) return;
    const texts = questionsForView.flatMap((r) =>
      [r.supportingEvidence, r.admissionCriteria, r.question].filter(Boolean) as string[]
    );
    if (selectedQuestion) texts.push(selectedQuestion);
    autoTranslate(texts);
  }, [selLevel, questionsForView.length]); // eslint-disable-line

  // Fetch collab counts when evidence table shown
  useEffect(() => {
    if (selLevel === null || !fwId || questionsForView.length === 0) return;
    const ids = questionsForView.map((r) => r.reqId).join(",");
    fetch(`/api/governance/compliance/${fwId}/collab?reqIds=${ids}`)
      .then((r) => r.json())
      .then((d) => setCollabCounts((p) => ({ ...p, ...d.counts })))
      .catch(() => {});
  }, [selLevel, questionsForView.length, fwId]); // eslint-disable-line

  // Helper: show translated text or original
  function tr(text: string | null | undefined): string {
    if (!text) return "";
    return translations[text] ?? text;
  }

  // ── Level selection with smart warning ──────────────────────────────────────
  async function selectLevel(std: string, ln: number) {
    if (!fwId) return;
    // Warn if any row above ln already has a non-default status or attached file
    const hasDataAbove = reqs.some((r) => {
      if (deriveStandard(r) !== std) return false;
      const lvl = parseLevelNum(r.maturityLevel);
      if (lvl === null || lvl <= ln) return false;
      return r.submissionStatus !== "NOT_COMPLETE" || r.evidenceName != null;
    });
    if (hasDataAbove) {
      setLevelWarning({ std, newLevel: ln });
      return;
    }
    await doSelectLevel(std, ln);
  }

  async function doSelectLevel(std: string, ln: number) {
    if (!fwId) return;
    // Always clear levels strictly above ln — removes assessments, workflow rows, and
    // evidence file data (stored as BYTEA in gov_compliance_assessments)
    await fetch(`/api/governance/compliance/${fwId}/maturity-selection`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standardCode: std, selectedLevel: ln, clear: true }),
    });
    // Reset UI state for every row above ln
    setReqs((p) => p.map((r) => {
      if (deriveStandard(r) !== std) return r;
      const lvl = parseLevelNum(r.maturityLevel);
      if (lvl !== null && lvl > ln) {
        return {
          ...r,
          submissionStatus:    "NOT_COMPLETE",
          evidenceName:        null,
          workflowStatus:      null,
          endorsedBy:          null,
          endorsedAt:          null,
          evidentAdminOverride: null,
          domainOwnerOverride:  null,
          managementNotes:     null,
          comments:            null,
        };
      }
      return r;
    }));
    setMaturitySels((s) => ({ ...s, [std]: ln }));
    setSelLevel(ln);
    setLevelWarning(null);
  }

  // ── Assessment actions ────────────────────────────────────────────────────────
  async function patch(req: ComplianceRequirement, updates: Partial<ComplianceRequirement>) {
    if (!fwId) return;
    const merged = { ...req, ...updates };
    setSaving((s) => new Set([...s, req.reqId]));
    await fetch(`/api/governance/compliance/${fwId}/assess`, {
      method: "POST", headers: { "Content-Type": "application/json" },
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) { toast("Workflow action failed"); return; }
    const next: Record<string, string> = { submit: "SUBMITTED", confirm: "CONFIRMED", endorse: "ENDORSED" };
    const labels: Record<string, string> = {
      submit:  "Evidence submitted for review. Reviewers have been notified.",
      confirm: "Evidence confirmed. Endorsers have been notified.",
      endorse: "Evidence endorsed. All parties notified.",
    };
    setReqs((p) => p.map((r) => r.reqId === req.reqId ? { ...r, workflowStatus: next[action] } : r));
    toast(labels[action]);
  }

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

  const { total, complete, na, notDone, pct } = overallStats;
  const selectedQuestion = selStandard
    ? (() => { const r = reqs.find((x) => deriveStandard(x) === selStandard); return r ? disp(r.questionEn, r.question) : ""; })()
    : "";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <span>✓</span>{toastMsg}
        </div>
      )}

      {/* Level-change warning modal */}
      {levelWarning && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-brand-deep text-lg mb-2">{ca.changeMatTitle}</h3>
            <p className="text-sm text-ink-soft mb-4">
              <span className="font-semibold">{levelWarning.std}</span>{" "}
              <span className="text-red-600 font-semibold">{ca.changeMatBody1} {levelWarning.newLevel}</span>.{" "}
              {ca.changeMatBody2}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setLevelWarning(null)} className="btn btn-sm">{t.common.cancel}</button>
              <button onClick={() => doSelectLevel(levelWarning.std, levelWarning.newLevel)}
                className="btn btn-sm bg-red-500 hover:bg-red-600 text-white border-red-500">
                {ca.clearAbove}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{ca.pageTitle}</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            {activeFramework?.name}{activeFramework?.version ? ` · ${activeFramework.version}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {frameworks.length > 1 && (
            <select value={fwId ?? ""} onChange={(e) => { resetAll(); router.push(`/governance/compliance?fw=${e.target.value}`); }}
              className="field w-auto text-sm">
              {frameworks.map((f) => <option key={f.frameworkId} value={f.frameworkId}>{f.name}</option>)}
            </select>
          )}
          <label className={`btn btn-sm cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? "Importing…" : "Import Excel"}
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          <button onClick={() => fwId && window.open(`/api/governance/compliance/${fwId}/export`, "_blank")}
            className="btn btn-sm btn-primary">Export Excel</button>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-md ${importMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {importMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label={ca.totalReqs}   value={total}    accent="#6366F1" />
        <StatCard label={ca.complete}    value={complete} accent="#10B981" />
        <StatCard label="N/A"            value={na}       accent="#6B7280" />
        <StatCard label={ca.notCompleted} value={notDone} accent="#F59E0B" />
      </div>

      {/* Progress */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-ink">{ca.overallProgress}</span>
          <span className="text-sm font-bold text-emerald-600">{pct}%</span>
        </div>
        <div className="h-3 bg-canvas rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(complete/Math.max(total,1)*100)}%` }} />
          <div className="h-full bg-gray-400 transition-all"   style={{ width: `${Math.round(na/Math.max(total,1)*100)}%` }} />
        </div>
        <div className="flex items-center gap-5 mt-2 text-[11px] text-muted">
          <Dot hex="#10B981" label={ca.complete} /><Dot hex="#6B7280" label="N/A" /><Dot hex="#E5E7EB" label={ca.notCompleted} />
        </div>
      </div>

      {/* ── Assessment ─────────────────────────────────────────────────────── */}
      <>
        {reqs.length === 0 ? (
            <div className="card p-16 text-center">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="font-bold text-brand-deep text-lg mb-2">No requirements loaded</h3>
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
                  <button onClick={resetAll} className="text-brand-purple hover:underline font-medium">{ca.allDomains}</button>
                  <span className="text-muted/50">›</span>
                  <button onClick={backToStandards}
                    className={`font-medium ${selStandard ? "text-brand-purple hover:underline" : "text-ink"}`}>
                    {isRtl ? (domainArMap.get(selDomain) ?? selDomain) : (domainEnMap.get(selDomain) ?? selDomain)}
                  </button>
                  {selStandard && (<>
                    <span className="text-muted/50">›</span>
                    <button onClick={backToLevels}
                      className={`font-medium ${selLevel !== null ? "text-brand-purple hover:underline" : "text-ink"}`}>
                      {selStandard}
                    </button>
                  </>)}
                  {selLevel !== null && (<>
                    <span className="text-muted/50">›</span>
                    <span className="font-bold px-2 py-0.5 rounded text-white text-[12px]"
                      style={{ backgroundColor: lvlColor(selLevel) }}>
                      Level {selLevel} — {lvlName(selLevel)}
                    </span>
                  </>)}
                </nav>
              )}

              {/* Step 1 — Domains */}
              {!selDomain && (
                <section>
                  <StepHeader n={1} label={ca.selectDomain} />
                  <div className="grid grid-cols-3 gap-4">
                    {domains.map((domain) => {
                      const s = domainStats(domain);
                      const rep = reqs.find((r) => (r.domain ?? "Other") === domain);
                      const dc = rep?.domainCode ?? "";
                      const enName = domainEnMap.get(domain) ?? domain;
                      const arName = domainArMap.get(domain) ?? domain;
                      const displayName = isRtl ? arName : enName;
                      const subtitle    = isRtl ? (dc || null) : (dc || null);
                      return (
                        <button key={domain} onClick={() => selectDomain(domain)}
                          className="card p-5 text-left hover:shadow-md hover:border-brand-purple/60 transition-all group border border-line">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-brand-deep group-hover:text-brand-purple text-sm leading-snug">{displayName}</div>
                              {subtitle && <div className="text-[11px] text-muted font-mono mt-0.5 truncate">{subtitle}</div>}
                            </div>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft shrink-0">{s.total}</span>
                          </div>
                          <div className="h-1.5 bg-canvas rounded-full overflow-hidden mb-1.5">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">{s.pct}% {ca.complete.toLowerCase()}</span>
                            <span className="text-muted">{s.complete} / {s.total}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Step 2 — Standards */}
              {selDomain && !selStandard && (
                <section>
                  <StepHeader n={2} label={ca.selectStandard} />
                  <div className="grid grid-cols-3 gap-4">
                    {standards.map(({ std, question }) => {
                      const s = standardStats(selDomain, std);
                      const selLvl = maturitySels[std];
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
                              {selLvl !== undefined && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                                  style={{ backgroundColor: lvlColor(selLvl) }}>L{selLvl}</span>
                              )}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft">{s.total}</span>
                            </div>
                          </div>
                          {question && (
                            <p className="text-[11px] text-ink-soft mb-3 leading-snug line-clamp-2"
                              dir={isRtl ? "rtl" : undefined}>
                              {question}
                            </p>
                          )}
                          <div className="h-2 rounded-full overflow-hidden flex mb-2 gap-px">
                            {lvlCounts.filter((l) => l.count > 0).map((l) => (
                              <div key={l.ln} className="h-full rounded-sm"
                                style={{ flex: l.count, backgroundColor: lvlColor(l.ln) }} />
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">{s.pct}% {ca.statComplete}</span>
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
                  <StepHeader n={3} label={ca.selectMaturity} />
                  {selectedQuestion && (
                    <div className="mb-5 p-4 bg-canvas-soft rounded-xl border border-line">
                      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{selStandard}</div>
                      <p className="text-sm text-ink leading-relaxed" dir={isRtl ? "rtl" : undefined}>
                        {selectedQuestion}
                      </p>
                    </div>
                  )}
                  {maturitySels[selStandard] !== undefined ? (
                    <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-2 mb-5">
                      Level <strong>{maturitySels[selStandard]}</strong> ({lvlName(maturitySels[selStandard])}) {ca.levelCurrently}
                    </p>
                  ) : (
                    <p className="text-sm text-ink-soft mb-5">{ca.levelLowerWarn}</p>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    {[0,1,2,3,4,5].map((ln) => {
                      const s          = levelStats(selDomain, selStandard, ln);
                      const col        = lvlColor(ln);
                      const name       = lvlName(ln);
                      const desc       = lvlDesc(ln);
                      const hasSqs     = s.total > 0;
                      const isSelected = maturitySels[selStandard] === ln;
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
                            isSelected ? "shadow-md"
                            : hasSqs   ? "hover:shadow-md cursor-pointer hover:border-brand-purple/40 border border-line"
                                       : "opacity-30 cursor-not-allowed border border-line"
                          }`}>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ backgroundColor: col }}>✓</div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-extrabold text-lg shrink-0"
                              style={{ backgroundColor: col }}>{ln}</span>
                            <span className="font-bold text-brand-deep text-sm">{name}</span>
                          </div>
                          {desc && <p className="text-[12px] text-ink-soft mb-3 leading-snug line-clamp-2">{desc}</p>}
                          <div className="text-[11px] text-muted mb-1">
                            {ln === 0 ? ca.levelOnly0 : `${ca.levelRangePrefix}${ln} ${ca.levelRangeSuffix}`}
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted">{s.total} {ca.levelItemsTotal}</span>
                            {hasSqs && <span className="font-semibold" style={{ color: s.pct > 0 ? "#10B981" : "#9CA3AF" }}>{s.pct}% {ca.levelDone}</span>}
                          </div>
                          {hasSqs && (
                            <div className="h-1 bg-canvas rounded-full overflow-hidden mt-2">
                              <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: col }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Step 4 — Evidence table */}
              {selDomain && selStandard && selLevel !== null && (
                <section>
                  {/* Question header */}
                  {selectedQuestion && (
                    <div className="mb-4 p-4 bg-canvas-soft rounded-xl border border-line">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono font-bold text-muted">{selStandard}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: lvlColor(selLevel) }}>
                          Level {selLevel} · {lvlName(selLevel)}
                        </span>
                        {selLevel > 0 && (
                          <span className="text-[10px] text-muted italic">
                            (showing levels 1–{selLevel}, {questionsForView.length} items total)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink leading-relaxed" dir={isRtl ? "rtl" : undefined}>
                        {selectedQuestion}
                      </p>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-[12px] flex-wrap">
                      <span className="text-emerald-600 font-semibold">
                        {questionsForView.filter((r) => r.submissionStatus === "COMPLETE").length} {ca.statComplete}
                      </span>
                      <span className="text-amber-600 font-semibold">
                        {questionsForView.filter((r) => r.submissionStatus === "NOT_COMPLETE").length} {ca.statNotCompleted}
                      </span>
                      <span className="text-gray-500">
                        {questionsForView.filter((r) => r.submissionStatus === "NA").length} N/A
                      </span>
                      <span className="text-muted">· {questionsForView.length} {ca.statItems}</span>
                    </div>
                    <button onClick={backToLevels} className="text-[11px] text-brand-purple hover:underline font-medium">
                      {ca.changeLevel}
                    </button>
                  </div>

                  {questionsForView.length === 0 ? (
                    <div className="card p-10 text-center text-ink-soft text-sm">No evidence items found.</div>
                  ) : (
                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1200px]">
                          <thead>
                            <tr className="border-b border-line bg-canvas-soft text-left">
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-8">{ca.colLvl}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">{ca.colCode}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">{ca.colEvidence}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">{ca.colType}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-32">{ca.colAdmin}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-32">{ca.colOwner}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">{ca.colStatus}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">{ca.colWorkflow}</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-8">💬</th>
                              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">{ca.colFile}</th>
                              <th className="px-3 py-2.5 w-7" />
                            </tr>
                          </thead>
                          <tbody>
                            {questionsForView.map((req) => {
                              const lvl = parseLevelNum(req.maturityLevel) ?? 0;
                              const threadCount = collabCounts[String(req.reqId)] ?? 0;
                              return (
                                <>
                                  <tr key={req.reqId}
                                    className={`border-b border-line-soft ${saving.has(req.reqId) ? "opacity-50" : "hover:bg-canvas/40"}`}>
                                    {/* Level badge */}
                                    <td className="px-2 py-3">
                                      <span className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold"
                                        style={{ backgroundColor: lvlColor(lvl) }}>{lvl}</span>
                                    </td>

                                    {/* Code + endorsement icon */}
                                    <td className="px-3 py-3">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded text-white"
                                          style={{ backgroundColor: lvlColor(lvl) }}>{req.reqCode}</span>
                                        {req.workflowStatus === "ENDORSED" && (
                                          <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                                            title="Endorsed">✓</span>
                                        )}
                                      </div>
                                      {disp(req.directoryTypeEn, req.directoryType) && (
                                        <div className="text-[10px] text-muted mt-0.5">{disp(req.directoryTypeEn, req.directoryType)}</div>
                                      )}
                                    </td>

                                    {/* Supporting Evidence */}
                                    <td className="px-3 py-3">
                                      <div className="text-[12px] text-ink leading-snug"
                                        dir={isRtl ? "rtl" : undefined}>
                                        {disp(req.supportingEvidenceEn, req.supportingEvidence)
                                          || <span className="text-muted italic">—</span>}
                                      </div>
                                    </td>

                                    {/* Compliance/Maturity type */}
                                    <td className="px-3 py-3">
                                      {(() => {
                                        const raw = req.complianceOrMaturity;
                                        if (!raw) return null;
                                        const cfgItem = complianceTypeMap.get(raw);
                                        const type = complianceTypeLabel(raw);
                                        if (!cfgItem && !type) return null;
                                        const label = cfgItem
                                          ? (isRtl && cfgItem.labelAr ? cfgItem.labelAr : cfgItem.label)
                                          : (type?.label ?? "");
                                        const isCompliance = type?.isCompliance ?? label.toLowerCase().includes("compliance");
                                        return (
                                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                            isCompliance ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                          }`}>{label}</span>
                                        );
                                      })()}
                                    </td>

                                    {/* Evident Admin */}
                                    <td className="px-3 py-3">
                                      <UserPicker
                                        value={req.evidentAdminOverride ?? req.evidentAdministrator ?? ""}
                                        users={users} placeholder="Assign admin"
                                        onSave={(v) => patch(req, { evidentAdminOverride: v || null })} />
                                    </td>

                                    {/* Domain Owner */}
                                    <td className="px-3 py-3">
                                      <UserPicker
                                        value={req.domainOwnerOverride ?? req.domainOwner ?? ""}
                                        users={users} placeholder="Assign owner"
                                        onSave={(v) => patch(req, { domainOwnerOverride: v || null })} />
                                    </td>

                                    {/* Status */}
                                    <td className="px-3 py-3">
                                      <StatusSelect
                                        value={req.submissionStatus}
                                        onChange={(v) => patch(req, { submissionStatus: v })}
                                        statusItems={statusConfigItems} />
                                    </td>

                                    {/* Workflow badge */}
                                    <td className="px-3 py-3">
                                      <WorkflowBadge status={req.workflowStatus ?? "DRAFT"} />
                                    </td>

                                    {/* Collab icon + count */}
                                    <td className="px-2 py-3">
                                      <button
                                        onClick={() => {
                                          setExpanded(req.reqId);
                                        }}
                                        className="flex items-center gap-0.5 text-muted hover:text-brand-purple transition-colors"
                                        title="Discussions">
                                        <ChatIcon />
                                        {threadCount > 0 && (
                                          <span className="text-[10px] font-bold text-brand-purple">{threadCount}</span>
                                        )}
                                      </button>
                                    </td>

                                    {/* Evidence file */}
                                    <td className="px-3 py-3">
                                      <label className="relative cursor-pointer block">
                                        {req.evidenceName ? (
                                          <a href={`/api/governance/compliance/${fwId}/evidence/${req.reqId}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-brand-purple text-[11px] truncate max-w-[72px] block hover:underline"
                                            title={req.evidenceName}>
                                            {req.evidenceName.length > 10 ? req.evidenceName.slice(0,9)+"…" : req.evidenceName}
                                          </a>
                                        ) : (
                                          <span className="text-[11px] text-muted/50 italic">Upload…</span>
                                        )}
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer"
                                          onChange={(e) => e.target.files?.[0] && uploadEvidence(req, e.target.files[0])} />
                                      </label>
                                    </td>

                                    {/* Expand */}
                                    <td className="px-2 py-3">
                                      <button onClick={() => setExpanded(expanded === req.reqId ? null : req.reqId)}
                                        className="text-muted/60 hover:text-ink text-xs leading-none">
                                        {expanded === req.reqId ? "▲" : "▼"}
                                      </button>
                                    </td>
                                  </tr>

                                  {/* Expanded row */}
                                  {expanded === req.reqId && (
                                    <tr key={`${req.reqId}-exp`} className="border-b border-line-soft bg-canvas-soft/60">
                                      <td colSpan={11} className="px-5 py-4">
                                        <EvidenceExpanded
                                          req={req}
                                          fwId={fwId ?? 0}
                                          role={currentUser.role}
                                          onPatch={(updates) => patch(req, updates)}
                                          onWorkflow={(action) => advanceWorkflow(req, action)}
                                          translations={translations}
                                        />
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
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
    </div>
  );
}

// ── Workflow badge (standalone) ───────────────────────────────────────────────
function WorkflowBadge({ status }: { status: string }) {
  const { t } = useLang();
  const ca = t.governance.ca;
  const WF_LABELS: Record<string, string> = {
    DRAFT: ca.wfDraft, SUBMITTED: ca.wfSubmitted, CONFIRMED: ca.wfConfirmed, ENDORSED: ca.wfEndorsed,
  };
  const meta = WORKFLOW_META[status] ?? WORKFLOW_META.DRAFT;
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ color: meta.color, backgroundColor: meta.bg }}>
      {WF_LABELS[status] ?? meta.label}
    </span>
  );
}

// ── Evidence expanded row ─────────────────────────────────────────────────────
function EvidenceExpanded({
  req, fwId, role, onPatch, onWorkflow, translations,
}: {
  req: ComplianceRequirement; fwId: number; role: string;
  onPatch: (u: Partial<ComplianceRequirement>) => void;
  onWorkflow: (action: "submit"|"confirm"|"endorse") => void;
  translations: Record<string, string>;
}) {
  const { isRtl, t } = useLang();
  const ca = t.governance.ca;
  function d(en: string | null | undefined, ar: string | null | undefined) {
    return isRtl ? (ar ?? en ?? "") : (en ?? ar ?? "");
  }

  const mgmtImported = d(req.managementSectorEn, req.managementSector);
  const [mgmt,     setMgmt]     = useState(req.managementNotes ?? mgmtImported);
  const [comments, setComments] = useState(req.comments ?? "");
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { setMgmt(req.managementNotes ?? d(req.managementSectorEn, req.managementSector)); },
    [req.managementNotes, req.managementSectorEn, req.managementSector, isRtl]); // eslint-disable-line
  useEffect(() => { setComments(req.comments ?? ""); }, [req.comments]);

  const isDirty = mgmt   !== (req.managementNotes ?? d(req.managementSectorEn, req.managementSector)) ||
                  comments !== (req.comments ?? "");

  async function saveAll() {
    setSaving(true);
    await onPatch({ managementNotes: mgmt || null, comments: comments || null });
    setSaving(false);
  }

  const status = req.workflowStatus ?? "DRAFT";
  const canSubmit  = status === "DRAFT"     && role !== "VIEWER";
  const canConfirm = status === "SUBMITTED" && (role === "ADMIN" || role === "STEWARD");
  const canEndorse = status === "CONFIRMED" && role === "ADMIN";

  const admissionCriteria = d(req.admissionCriteriaEn, req.admissionCriteria);
  const directoryType     = d(req.directoryTypeEn,     req.directoryType);

  return (
    <div className="space-y-4">
      {/* Static fields */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[12px]">
        {admissionCriteria && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5">{ca.admCriteria}</div>
            <div className="text-ink leading-snug" dir={isRtl ? "rtl" : undefined}>
              {admissionCriteria}
            </div>
          </div>
        )}
        {req.directoryCode && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5">{ca.evidCode}</div>
            <div className="text-ink font-mono text-[11px]">{req.directoryCode}</div>
          </div>
        )}
        {directoryType && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5">{ca.evidType}</div>
            <div className="text-ink">{directoryType}</div>
          </div>
        )}
        {req.operationalExcellence && req.operationalExcellence !== "N/A" && req.operationalExcellence !== "لا" && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5">{ca.opExcellence}</div>
            <div className="text-ink">{req.operationalExcellence}</div>
          </div>
        )}
      </div>

      {/* Management & Supporting Sector */}
      <div>
        <label className="block text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">
          {ca.mgmtSector}
        </label>
        {mgmtImported && !req.managementNotes && (
          <div className={`text-[11px] bg-canvas border border-line rounded px-2 py-1.5 mb-1.5 ${isRtl ? "text-right" : ""}`}
            dir={isRtl ? "rtl" : undefined}>
            <span className="text-muted/70">{mgmtImported}</span>
            <span className="ml-2 text-[10px] text-muted italic">(imported)</span>
          </div>
        )}
        <textarea value={mgmt} onChange={(e) => setMgmt(e.target.value)} rows={2}
          className="field text-[12px] w-full" placeholder="Enter management & supporting sector notes…" />
      </div>

      {/* Comments */}
      <div>
        <label className="block text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">{ca.comments}</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
          className="field text-[12px] w-full" placeholder="Add comments…" />
      </div>

      {/* Save Changes */}
      {isDirty && (
        <button onClick={saveAll} disabled={saving} className="btn btn-sm btn-primary">
          {saving ? t.common.saving : ca.saveChanges}
        </button>
      )}

      {/* Workflow section */}
      <div className="border border-line rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide">{ca.approveWorkflow}</div>
          <WorkflowBadge status={status} />
        </div>
        {req.endorsedBy && req.endorsedAt && (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1 mb-3">
            ✓ {isRtl ? "اعتمده" : "Endorsed by"} <strong>{req.endorsedBy}</strong> {isRtl ? "بتاريخ" : "on"} {fmtDate(req.endorsedAt)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {status !== "ENDORSED" && (
            <button onClick={saveAll} disabled={saving} className="btn btn-sm">
              💾 {ca.saveAsDraft}
            </button>
          )}
          {canSubmit && (
            <button onClick={() => onWorkflow("submit")}
              className="btn btn-sm bg-amber-500 hover:bg-amber-600 text-white border-amber-500">
              {ca.submitReview} →
            </button>
          )}
          {canConfirm && (
            <button onClick={() => onWorkflow("confirm")}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-blue-600">
              {ca.confirmAction} ✓
            </button>
          )}
          {canEndorse && (
            <button onClick={() => onWorkflow("endorse")}
              className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600">
              {ca.endorseAction} ✓✓
            </button>
          )}
          {status === "ENDORSED" && (
            <span className="text-[12px] text-emerald-700 font-semibold flex items-center gap-1">
              <span>✓</span> {ca.fullyEndorsed}
            </span>
          )}
        </div>
      </div>

      {/* Collaboration */}
      <CollabPanel reqId={req.reqId} fwId={fwId} />

      {/* History — auto-open */}
      <HistoryPanel reqId={req.reqId} fwId={fwId} />
    </div>
  );
}

// ── Collab panel ──────────────────────────────────────────────────────────────
function CollabPanel({ reqId, fwId }: { reqId: number; fwId: number }) {
  const { t } = useLang();
  const ca = t.governance.ca;
  const [threads,    setThreads]    = useState<CollabThread[] | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [title,      setTitle]      = useState("");
  const [body,       setBody]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open,       setOpen]       = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && threads === null && !loading) {
      setLoading(true);
      fetch(`/api/governance/compliance/${fwId}/collab/${reqId}`)
        .then((r) => r.json())
        .then((d) => { setThreads(d.threads ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/governance/compliance/${fwId}/collab/${reqId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
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
    <div className="border border-line rounded-xl overflow-hidden">
      <button onClick={toggle}
        className="w-full px-4 py-2.5 bg-canvas-soft flex items-center justify-between hover:bg-canvas transition-colors">
        <div className="flex items-center gap-2">
          <ChatIcon className="text-brand-purple" />
          <span className="text-[12px] font-semibold text-ink">
            {ca.discussions} {threads !== null ? `(${threads.length})` : ""}
          </span>
        </div>
        <span className="text-muted text-[11px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-line">
          <div className="px-4 py-2 border-b border-line-soft flex justify-end">
            <button onClick={() => setShowForm((v) => !v)}
              className="text-[11px] font-semibold text-brand-purple hover:text-brand-deep">
              + {ca.startDiscussion}
            </button>
          </div>
          {showForm && (
            <div className="px-4 py-3 border-b border-line-soft bg-white space-y-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Discussion title…" className="field text-[12px] w-full" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)}
                rows={2} placeholder="Your message…" className="field text-[12px] w-full" />
              <div className="flex gap-2">
                <button onClick={submit} disabled={submitting || !title.trim() || !body.trim()}
                  className="btn btn-sm btn-primary text-[11px]">
                  {submitting ? "…" : ca.postBtn}
                </button>
                <button onClick={() => setShowForm(false)} className="btn btn-sm text-[11px]">{t.common.cancel}</button>
              </div>
            </div>
          )}
          {loading && <div className="px-4 py-3 text-[12px] text-muted italic">Loading…</div>}
          {!loading && threads !== null && threads.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-muted italic">{ca.noDiscussions}</div>
          )}
          {!loading && threads !== null && threads.map((t) => (
            <div key={t.threadId} className="px-4 py-2.5 border-b border-line-soft last:border-0 flex items-start gap-2">
              <ChatIcon className="text-brand-purple mt-0.5 shrink-0" />
              <div className="min-w-0">
                <a href={`/collaboration/${t.threadId}`} target="_blank"
                  className="text-[12px] font-semibold text-ink hover:text-brand-purple block truncate">
                  {t.title}
                </a>
                <span className="text-[10px] text-muted">
                  {t.messageCount} msg{t.messageCount !== 1 ? "s" : ""} · {fmtDate(t.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History panel (auto-open) ─────────────────────────────────────────────────
function HistoryPanel({ reqId, fwId }: { reqId: number; fwId: number }) {
  const { t } = useLang();
  const ca = t.governance.ca;
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(true); // default open

  useEffect(() => {
    fetch(`/api/governance/compliance/${fwId}/history/${reqId}`)
      .then((r) => r.json())
      .then((d) => { setHistory(d.history ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reqId, fwId]);

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 bg-canvas-soft flex items-center justify-between hover:bg-canvas transition-colors">
        <span className="text-[12px] font-semibold text-ink">
          {ca.changeHistory} {history !== null ? `(${history.length})` : loading ? "…" : ""}
        </span>
        <span className="text-muted text-[11px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-line">
          {loading && <div className="px-4 py-3 text-[12px] text-muted italic">Loading history…</div>}
          {!loading && history !== null && history.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-muted italic">{ca.noHistory}</div>
          )}
          {!loading && history !== null && history.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-canvas-soft border-b border-line text-left">
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">{ca.histDate}</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">{ca.histField}</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">{ca.histPrevious}</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">{ca.histNewValue}</th>
                  <th className="px-3 py-2 text-muted font-semibold uppercase tracking-wide">{ca.histChangedBy}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.historyId} className="border-b border-line-soft hover:bg-canvas/30">
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtDate(h.changedAt)}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{h.fieldLabel}</td>
                    <td className="px-3 py-2 text-muted/80 max-w-[140px] truncate" title={h.oldValue ?? ""}>
                      {h.oldValue
                        ? <span className="line-through">{h.oldValue.length > 30 ? h.oldValue.slice(0,28)+"…" : h.oldValue}</span>
                        : <span className="italic text-muted/50">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink max-w-[140px] truncate" title={h.newValue ?? ""}>
                      {h.newValue
                        ? (h.newValue.length > 30 ? h.newValue.slice(0,28)+"…" : h.newValue)
                        : <span className="italic text-muted/50">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{h.changedByName ?? h.changedBy}</td>
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

const STATUSES_FALLBACK = [
  { code: "NOT_COMPLETE", label: "Not Completed", hex: "#F59E0B" },
  { code: "COMPLETE",     label: "Complete",      hex: "#10B981" },
  { code: "NA",           label: "N/A",           hex: "#6B7280" },
];
function StatusSelect({ value, onChange, statusItems }: {
  value: string; onChange: (v: string) => void; statusItems: ConfigItem[];
}) {
  const { isRtl } = useLang();
  const statuses = statusItems.length > 0
    ? statusItems.map((i) => ({
        code: i.code,
        label: isRtl && i.labelAr ? i.labelAr : i.label,
        hex: i.colorHex ?? "#6B7280",
      }))
    : STATUSES_FALLBACK;
  const s = statuses.find((x) => x.code === value) ?? statuses[0];
  if (!s) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 cursor-pointer appearance-none pr-6"
      style={{
        backgroundColor: `${s.hex}20`, color: s.hex,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23${s.hex.slice(1)}'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center",
      }}>
      {statuses.map((st) => <option key={st.code} value={st.code}>{st.label}</option>)}
    </select>
  );
}

function UserPicker({ value, users, placeholder, onSave }: {
  value: string; users: UserOption[]; placeholder: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [search,  setSearch]  = useState("");
  const filtered = useMemo(() => {
    const lq = search.toLowerCase();
    return users.filter((u) => !lq || u.fullName?.toLowerCase().includes(lq) || u.email.toLowerCase().includes(lq)).slice(0, 12);
  }, [users, search]);

  if (!editing) return (
    <button onClick={() => { setSearch(""); setEditing(true); }}
      className="text-[12px] text-left w-full truncate block text-ink hover:text-brand-purple transition-colors">
      {value
        ? <span className="flex items-center gap-1.5"><UserIcon />{value}</span>
        : <span className="text-muted/50 italic">{placeholder}</span>}
    </button>
  );

  return (
    <div className="relative z-50">
      <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        className="field text-[12px] py-0.5 px-1.5 w-full" placeholder="Search users…" />
      <div className="absolute top-full left-0 mt-0.5 w-56 bg-white rounded-lg shadow-xl border border-line overflow-hidden z-50">
        <button onMouseDown={() => { onSave(""); setEditing(false); }}
          className="w-full text-left px-3 py-2 text-[11px] text-muted/70 italic hover:bg-canvas border-b border-line-soft">
          — Remove
        </button>
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
      <path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414l-2 2A.5.5 0 0 1 1.5 13V2a1 1 0 0 1 1-1h11zm-3 4H5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1zm0 2H5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1z"/>
    </svg>
  );
}
