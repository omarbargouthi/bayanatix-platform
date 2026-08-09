"use client";

import { useState, useMemo, useEffect } from "react";
import type {
  ComplianceFramework, ComplianceRequirement,
  LevelConfig, UserOption, ConfigItem, DomainConfig,
} from "@/lib/queries/gov-compliance";

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseLevelNum(ml: string | null): number | null {
  if (!ml) return null;
  const m = ml.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : null;
  return n !== null && n >= 0 && n <= 5 ? n : null;
}

function hasArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

function deriveStandard(req: ComplianceRequirement): string {
  if (req.standard?.trim()) return req.standard.trim();
  if (req.standardCode?.trim()) return req.standardCode.trim();
  return req.domainCode ?? "General";
}

function complianceTypeLabel(raw: string | null | undefined) {
  if (!raw) return null;
  const isCompliance = raw.includes("امتثال") || raw.toLowerCase().includes("compliance");
  const isMaturity   = raw.includes("نضج")    || raw.toLowerCase().includes("maturity");
  if (!isCompliance && !isMaturity) return null;
  return { label: isCompliance ? "Compliance" : "Maturity", isCompliance };
}

const LEVEL_DOT: Record<number, string> = {
  0: "bg-slate-400",
  1: "bg-red-400",
  2: "bg-orange-400",
  3: "bg-amber-500",
  4: "bg-blue-500",
  5: "bg-green-600",
};

const LEVEL_BAND: Record<number, string> = {
  0: "bg-slate-50 text-slate-600",
  1: "bg-red-50 text-red-700",
  2: "bg-orange-50 text-orange-700",
  3: "bg-amber-50 text-amber-800",
  4: "bg-blue-50 text-blue-700",
  5: "bg-green-50 text-green-800",
};

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = {
  frameworks: ComplianceFramework[];
  users:      UserOption[];
};

type LevelGroup    = { levelNum: number; questions: ComplianceRequirement[] };
type StandardGroup = { standard: string; levels: LevelGroup[] };
type DomainGroup   = { domainCode: string; domainName: string; standards: StandardGroup[] };

// ── Main ───────────────────────────────────────────────────────────────────────
export function MaturityIndexClient({ frameworks, users }: Props) {
  const [fwId,        setFwId]        = useState<number>(frameworks[0]?.frameworkId ?? 0);
  const [levelCfg,    setLevelCfg]    = useState<LevelConfig[]>([]);
  const [cfgItems,    setCfgItems]    = useState<ConfigItem[]>([]);
  const [domainCfg,   setDomainCfg]  = useState<DomainConfig[]>([]);
  const [reqs,        setReqs]        = useState<ComplianceRequirement[] | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [translating, setTranslating] = useState(0);
  const [q,           setQ]           = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const [editing,     setEditing]     = useState<ComplianceRequirement | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [applicabilityOverrides, setApplicabilityOverrides] = useState<Record<number, boolean>>({});

  // collapse state — keyed by domainCode / "domainCode::standard"
  const [collapsedDomains,    setCollapsedDomains]    = useState<Set<string>>(new Set());
  const [collapsedStandards,  setCollapsedStandards]  = useState<Set<string>>(new Set());

  const domainNameMap = useMemo(() => {
    const map = new Map<string, string>();
    domainCfg.forEach(d => { if (d.domainCode) map.set(d.domainCode, d.nameEn); });
    return map;
  }, [domainCfg]);

  useEffect(() => {
    if (!fwId) return;
    setLoading(true);
    setReqs(null);
    setQ("");
    setFilterDomain("");
    setCollapsedDomains(new Set());
    setCollapsedStandards(new Set());
    Promise.all([
      fetch(`/api/governance/compliance/${fwId}/config`).then(r => r.json()),
      fetch(`/api/governance/compliance/${fwId}/config-items`).then(r => r.json()),
      fetch(`/api/governance/compliance/${fwId}/admin/requirements`).then(r => r.json()),
      fetch(`/api/governance/compliance/${fwId}/domain-config`).then(r => r.json()),
    ]).then(([cfgData, itemsData, reqData, dcData]) => {
      setLevelCfg(Array.isArray(cfgData) ? cfgData : []);
      setCfgItems(itemsData.items ?? []);
      setReqs(reqData.requirements ?? []);
      setDomainCfg(dcData.configs ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fwId]);

  // Auto-translate missing EN supporting evidence
  useEffect(() => {
    if (!reqs || reqs.length === 0) return;
    const missing = reqs.filter(
      r => !r.supportingEvidenceEn && r.supportingEvidence && hasArabic(r.supportingEvidence)
    );
    if (missing.length === 0) return;
    let cancelled = false;
    setTranslating(missing.length);
    (async () => {
      for (let i = 0; i < missing.length; i += 4) {
        if (cancelled) break;
        await Promise.all(missing.slice(i, i + 4).map(async req => {
          if (cancelled) return;
          try {
            const res  = await fetch(`/api/governance/compliance/${fwId}/translate`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: req.supportingEvidence }),
            });
            const data = await res.json();
            if (data.translation && !cancelled) {
              const enVal: string = data.translation;
              await fetch(`/api/governance/compliance/${fwId}/admin/requirements/${req.reqId}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ supportingEvidenceEn: enVal }),
              });
              setReqs(p => p ? p.map(r => r.reqId === req.reqId ? { ...r, supportingEvidenceEn: enVal } : r) : p);
            }
          } catch {}
          setTranslating(n => Math.max(0, n - 1));
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [reqs?.length]); // eslint-disable-line

  const complianceTypeItems = useMemo(
    () => cfgItems.filter(i => i.configGroup === "COMPLIANCE_TYPE"),
    [cfgItems]
  );

  const uniqueDomains = useMemo(() => {
    if (!reqs) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const r of reqs) {
      const code  = r.domainCode ?? "";
      const label = code
        ? (domainNameMap.get(code) ?? r.domainEn ?? r.domain ?? code)
        : (r.domainEn ?? r.domain ?? "");
      if (label && !seen.has(code || label)) {
        seen.add(code || label);
        out.push({ value: code || label, label });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [reqs, domainNameMap]);

  // Build domain → standard → level → questions hierarchy
  const grouped = useMemo<DomainGroup[]>(() => {
    if (!reqs) return [];
    const lq = q.toLowerCase();

    const visible = reqs.filter(r => {
      if (lq && !(
        (r.questionEn ?? r.question ?? "").toLowerCase().includes(lq) ||
        (r.reqCode ?? "").toLowerCase().includes(lq) ||
        (r.supportingEvidenceEn ?? r.supportingEvidence ?? "").toLowerCase().includes(lq) ||
        deriveStandard(r).toLowerCase().includes(lq)
      )) return false;
      if (filterDomain) {
        const domKey = r.domainCode || (r.domainEn ?? r.domain ?? "");
        if (domKey !== filterDomain) return false;
      }
      return true;
    });

    // nested maps: domainCode → standard → levelNum → rows
    const tree = new Map<string, {
      domainName: string;
      standards:  Map<string, Map<number, ComplianceRequirement[]>>;
    }>();

    for (const r of visible) {
      const domCode  = r.domainCode ?? "";
      const domName  = domCode
        ? (domainNameMap.get(domCode) ?? r.domainEn ?? r.domain ?? domCode)
        : (r.domainEn ?? r.domain ?? "Unknown Domain");
      const std = deriveStandard(r);
      const lvl = parseLevelNum(r.maturityLevel) ?? 0;

      if (!tree.has(domCode)) tree.set(domCode, { domainName: domName, standards: new Map() });
      const domNode = tree.get(domCode)!;
      if (!domNode.standards.has(std)) domNode.standards.set(std, new Map());
      const stdNode = domNode.standards.get(std)!;
      if (!stdNode.has(lvl)) stdNode.set(lvl, []);
      stdNode.get(lvl)!.push(r);
    }

    return Array.from(tree.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domCode, { domainName, standards }]) => ({
        domainCode: domCode,
        domainName,
        standards: Array.from(standards.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([standard, levMap]) => ({
            standard,
            levels: Array.from(levMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([levelNum, questions]) => ({
                levelNum,
                questions: questions.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
              })),
          })),
      }));
  }, [reqs, q, filterDomain, domainNameMap]);

  function toggleDomain(code: string) {
    setCollapsedDomains(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  function toggleStandard(key: string) {
    setCollapsedStandards(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function saveEdit(req: ComplianceRequirement, updates: Partial<ComplianceRequirement>) {
    setSaving(true);
    await fetch(`/api/governance/compliance/${fwId}/admin/requirements/${req.reqId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setReqs(p => p ? p.map(r => r.reqId === req.reqId ? { ...r, ...updates } : r) : p);
    setSaving(false);
    setEditing(null);
  }

  const selectedFw = frameworks.find((f) => f.frameworkId === fwId);
  const isApplicable = applicabilityOverrides[fwId] ?? selectedFw?.isApplicable ?? true;

  async function toggleApplicable() {
    const next = !isApplicable;
    setApplicabilityOverrides((prev) => ({ ...prev, [fwId]: next }));
    await fetch(`/api/governance/compliance/${fwId}/applicability`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isApplicable: next }),
    });
  }

  const totalVisible = grouped.reduce((s, dom) =>
    s + dom.standards.reduce((s2, std) =>
      s2 + std.levels.reduce((s3, lv) => s3 + lv.questions.length, 0), 0), 0);

  return (
    <div>
      {/* Framework selector */}
      {frameworks.length > 1 && (
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-semibold text-ink-soft">Framework</label>
          <select value={fwId} onChange={e => setFwId(Number(e.target.value))} className="field w-auto text-sm">
            {frameworks.map(f => (
              <option key={f.frameworkId} value={f.frameworkId}>{f.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none">
            <input type="checkbox" checked={isApplicable} onChange={toggleApplicable} className="w-3.5 h-3.5 accent-brand-purple" />
            Applicable to organization
          </label>
        </div>
      )}
      {frameworks.length === 1 && (
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-purple/10 text-brand-purple text-sm font-semibold">
            {frameworks[0].name}
            {frameworks[0].version && (
              <span className="text-brand-purple/60 font-normal">· {frameworks[0].version}</span>
            )}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none">
            <input type="checkbox" checked={isApplicable} onChange={toggleApplicable} className="w-3.5 h-3.5 accent-brand-purple" />
            Applicable to organization
          </label>
        </div>
      )}

      {/* Search + filter */}
      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <input
          value={q} onChange={e => setQ(e.target.value)}
          className="field text-sm flex-1 min-w-[220px]"
          placeholder="Search questions, evidence codes, standards…"
        />
        <select
          value={filterDomain}
          onChange={e => setFilterDomain(e.target.value)}
          className="field text-sm py-1.5 w-auto min-w-[180px]"
        >
          <option value="">All Domains</option>
          {uniqueDomains.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        {(q || filterDomain) && (
          <button
            onClick={() => { setQ(""); setFilterDomain(""); }}
            className="text-[11px] text-muted hover:text-brand-purple font-semibold"
          >
            Clear
          </button>
        )}
        {translating > 0 && (
          <span className="text-brand-purple animate-pulse text-[11px]">
            Translating {translating} fields…
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted">{totalVisible} questions</span>
      </div>

      {loading && (
        <div className="card p-8 text-center text-muted text-sm">Loading requirements…</div>
      )}

      {!loading && reqs !== null && (
        <div className="space-y-3">
          {grouped.length === 0 && (
            <div className="card p-8 text-center text-muted text-sm italic">No requirements match.</div>
          )}

          {grouped.map(dom => {
            const isDomOpen = !collapsedDomains.has(dom.domainCode);
            const totalQs   = dom.standards.reduce((s, std) =>
              s + std.levels.reduce((s2, lv) => s2 + lv.questions.length, 0), 0);

            return (
              <div key={dom.domainCode} className="border border-line rounded-xl overflow-hidden">

                {/* ── Domain header ── */}
                <button
                  onClick={() => toggleDomain(dom.domainCode)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-brand-deep/[0.06] hover:bg-brand-deep/10 text-left transition-colors"
                >
                  <svg
                    className={`w-4 h-4 text-brand-deep/50 transition-transform shrink-0 ${isDomOpen ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-bold text-brand-deep text-sm">{dom.domainName}</span>
                  {dom.domainCode && (
                    <span className="text-[10px] font-mono text-brand-deep/60 bg-brand-deep/8 px-1.5 py-0.5 rounded">
                      {dom.domainCode}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-muted shrink-0">
                    {dom.standards.length} standard{dom.standards.length !== 1 ? "s" : ""} · {totalQs} question{totalQs !== 1 ? "s" : ""}
                  </span>
                </button>

                {isDomOpen && (
                  <div>
                    {dom.standards.map((std, si) => {
                      const stdKey    = `${dom.domainCode}::${std.standard}`;
                      const isStdOpen = !collapsedStandards.has(stdKey);
                      const stdQs     = std.levels.reduce((s, lv) => s + lv.questions.length, 0);

                      return (
                        <div key={std.standard} className={si > 0 ? "border-t border-line-soft" : ""}>

                          {/* ── Standard header ── */}
                          <button
                            onClick={() => toggleStandard(stdKey)}
                            className="w-full flex items-center gap-3 px-5 py-2.5 bg-canvas-soft hover:bg-canvas text-left transition-colors"
                          >
                            <svg
                              className={`w-3.5 h-3.5 text-muted transition-transform shrink-0 ${isStdOpen ? "rotate-90" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="font-mono text-[13px] font-bold text-ink">{std.standard}</span>
                            <span className="ml-auto text-[11px] text-muted shrink-0">
                              {stdQs} question{stdQs !== 1 ? "s" : ""}
                            </span>
                          </button>

                          {isStdOpen && (
                            <div className="border-t border-line-soft">
                              {std.levels.map(lev => {
                                const cfg  = levelCfg.find(l => l.levelNum === lev.levelNum);
                                const dot  = LEVEL_DOT[lev.levelNum]  ?? "bg-slate-400";
                                const band = LEVEL_BAND[lev.levelNum] ?? "bg-slate-50 text-slate-600";

                                return (
                                  <div key={lev.levelNum}>
                                    {/* ── Level band ── */}
                                    <div className={`flex items-center gap-2.5 px-6 py-1.5 border-b border-black/5 ${band}`}>
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white shrink-0 ${dot}`}>
                                        {lev.levelNum}
                                      </span>
                                      <span className="text-[11px] font-bold uppercase tracking-wide">
                                        {cfg ? cfg.name : `Level ${lev.levelNum}`}
                                      </span>
                                      {cfg?.nameAr && (
                                        <span className="text-[11px] opacity-60 ml-1" dir="rtl">
                                          {cfg.nameAr}
                                        </span>
                                      )}
                                      <span className="ml-auto text-[10px] opacity-50">
                                        {lev.questions.length} question{lev.questions.length !== 1 ? "s" : ""}
                                      </span>
                                    </div>

                                    {/* ── Questions ── */}
                                    {lev.questions.map((req, qi) => {
                                      const questionText = req.questionEn ?? req.question ?? "";
                                      const evidenceSnip = req.supportingEvidenceEn ?? req.supportingEvidence ?? "";
                                      return (
                                        <div
                                          key={req.reqId}
                                          className={`flex items-start gap-3 px-6 py-3 bg-white hover:bg-canvas/50 ${qi < lev.questions.length - 1 ? "border-b border-line-soft/40" : ""}`}
                                        >
                                          {/* Evidence code badge */}
                                          <span className="text-[10px] font-mono bg-muted/10 text-muted rounded px-1.5 py-0.5 shrink-0 mt-0.5 whitespace-nowrap">
                                            {req.reqCode}
                                          </span>

                                          {/* Question + evidence snippet */}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm text-ink leading-snug">{questionText || <em className="text-muted/50">No question text</em>}</p>
                                            {evidenceSnip && (
                                              <p className="text-[11px] text-muted mt-0.5 line-clamp-1">
                                                {evidenceSnip}
                                              </p>
                                            )}
                                          </div>

                                          <button
                                            onClick={() => setEditing(req)}
                                            className="text-[11px] text-brand-purple hover:text-brand-deep font-semibold shrink-0 mt-0.5"
                                          >
                                            Edit
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditRequirementDialog
          req={editing}
          saving={saving}
          levelCfg={levelCfg}
          complianceTypeItems={complianceTypeItems}
          onSave={u => saveEdit(editing, u)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Edit dialog ────────────────────────────────────────────────────────────────
function EditRequirementDialog({ req, saving, onSave, onClose, levelCfg, complianceTypeItems }: {
  req: ComplianceRequirement;
  saving: boolean;
  onSave: (u: Partial<ComplianceRequirement>) => void;
  onClose: () => void;
  levelCfg: LevelConfig[];
  complianceTypeItems: ConfigItem[];
}) {
  function resolveComplianceCode(raw: string | null | undefined): string {
    if (!raw) return "";
    const direct = complianceTypeItems.find(i => i.label.toLowerCase() === raw.toLowerCase());
    if (direct) return direct.code;
    const arMatch = complianceTypeItems.find(i => i.labelAr === raw);
    if (arMatch) return arMatch.code;
    const t = complianceTypeLabel(raw);
    if (t) {
      const fb = complianceTypeItems.find(i =>
        t.isCompliance ? i.label.toLowerCase().includes("compliance") : i.label.toLowerCase().includes("maturity")
      );
      if (fb) return fb.code;
    }
    return "";
  }

  const parsedInitLevel = parseLevelNum(req.maturityLevel);
  const initCompCode    = resolveComplianceCode(req.complianceOrMaturity);

  const [v, setV] = useState({
    question:             req.question            ?? "",
    supportingEvidence:   req.supportingEvidence  ?? "",
    admissionCriteria:    req.admissionCriteria   ?? "",
    managementSector:     req.managementSector    ?? "",
    directoryCode:        req.directoryCode       ?? "",
    directoryType:        req.directoryType       ?? "",
    complianceOrMaturity: req.complianceOrMaturity ?? "",
    evidentAdministrator: req.evidentAdministrator ?? "",
    domainOwner:          req.domainOwner          ?? "",
    maturityLevel:        parsedInitLevel !== null ? String(parsedInitLevel) : "",
    questionEn:           req.questionEn           ?? "",
    supportingEvidenceEn: req.supportingEvidenceEn ?? "",
    admissionCriteriaEn:  req.admissionCriteriaEn  ?? "",
    managementSectorEn:   req.managementSectorEn   ?? "",
    directoryTypeEn:      req.directoryTypeEn      ?? "",
  });
  const [compCode, setCompCode] = useState(initCompCode);

  function set(k: keyof typeof v, val: string) { setV(p => ({ ...p, [k]: val })); }

  function handleCompCodeChange(code: string) {
    setCompCode(code);
    const item = complianceTypeItems.find(i => i.code === code);
    setV(p => ({ ...p, complianceOrMaturity: item?.label ?? code }));
  }

  const selectedCompItem = complianceTypeItems.find(i => i.code === compCode);
  const selectedLevel    = levelCfg.find(lc => String(lc.levelNum) === v.maturityLevel);

  function save() {
    const original = {
      ...req,
      complianceOrMaturity: req.complianceOrMaturity ?? "",
      maturityLevel: parsedInitLevel !== null ? String(parsedInitLevel) : "",
    };
    const updates: Record<string, string | null> = {};
    (Object.keys(v) as Array<keyof typeof v>).forEach(k => {
      const nv = v[k].trim();
      const ov = ((original[k as keyof typeof original] ?? "") as string).trim();
      if (nv !== ov) updates[k] = nv || null;
    });
    onSave(updates as Partial<ComplianceRequirement>);
  }

  const bilingualFields: Array<[string, string, keyof typeof v, keyof typeof v]> = [
    ["Question",                       "السؤال",        "questionEn",           "question"],
    ["Supporting Evidence",            "الدليل الداعم", "supportingEvidenceEn", "supportingEvidence"],
    ["Admission Criteria",             "معايير القبول", "admissionCriteriaEn",  "admissionCriteria"],
    ["Management & Supporting Sector", "القطاع الداعم", "managementSectorEn",   "managementSector"],
    ["Evidence Type",                  "نوع الدليل",    "directoryTypeEn",      "directoryType"],
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-brand-deep">Edit Requirement</h3>
            <p className="text-[11px] text-muted font-mono">{req.reqCode}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line pb-2 mb-1">
            <div className="text-[10px] font-bold text-brand-purple uppercase tracking-wide">English (EN)</div>
            <div className="text-[10px] font-bold text-brand-purple uppercase tracking-wide text-right" dir="rtl">العربية (AR)</div>
          </div>

          {bilingualFields.map(([labelEn, labelAr, keyEn, keyAr]) => (
            <div key={keyEn} className="grid grid-cols-2 gap-x-4">
              <div>
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">{labelEn}</label>
                <textarea value={v[keyEn]} onChange={e => set(keyEn, e.target.value)} rows={2} className="field text-sm w-full" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1 text-right" dir="rtl">{labelAr}</label>
                <textarea value={v[keyAr]} onChange={e => set(keyAr, e.target.value)} rows={2} dir="rtl" className="field text-sm w-full text-right" />
              </div>
            </div>
          ))}

          <div className="border-t border-line pt-4 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Evidence Code</label>
              <input value={v.directoryCode} onChange={e => set("directoryCode", e.target.value)} className="field text-sm w-full" />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">Compliance or Maturity</label>
              <div className="grid grid-cols-2 gap-x-4">
                <div>
                  <label className="text-[10px] text-brand-purple font-bold uppercase tracking-wide mb-1 block">English (EN)</label>
                  {complianceTypeItems.length > 0 ? (
                    <select value={compCode} onChange={e => handleCompCodeChange(e.target.value)} className="field text-sm w-full">
                      <option value="">— Select type —</option>
                      {complianceTypeItems.map(item => (
                        <option key={item.code} value={item.code}>{item.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={v.complianceOrMaturity} onChange={e => set("complianceOrMaturity", e.target.value)}
                      className="field text-sm w-full" placeholder="e.g. Compliance or Maturity" />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-brand-purple font-bold uppercase tracking-wide mb-1 block text-right" dir="rtl">العربية (AR)</label>
                  <div className="field text-sm w-full text-right bg-canvas-soft text-ink-soft min-h-[38px] flex items-center justify-end px-3" dir="rtl">
                    {selectedCompItem?.labelAr ?? <span className="italic text-muted/60 text-[11px]">—</span>}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">Maturity Level</label>
              <div className="grid grid-cols-2 gap-x-4">
                <div>
                  <label className="text-[10px] text-brand-purple font-bold uppercase tracking-wide mb-1 block">English (EN)</label>
                  <select value={v.maturityLevel} onChange={e => set("maturityLevel", e.target.value)} className="field text-sm w-full">
                    <option value="">— Select level —</option>
                    {levelCfg.map(lc => (
                      <option key={lc.levelNum} value={String(lc.levelNum)}>
                        Level {lc.levelNum} — {lc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-brand-purple font-bold uppercase tracking-wide mb-1 block text-right" dir="rtl">العربية (AR)</label>
                  <div className="field text-sm w-full text-right bg-canvas-soft text-ink-soft min-h-[38px] flex items-center justify-end px-3" dir="rtl">
                    {selectedLevel?.nameAr ?? <span className="italic text-muted/60 text-[11px]">—</span>}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Evident Administrator</label>
              <input value={v.evidentAdministrator} onChange={e => set("evidentAdministrator", e.target.value)} className="field text-sm w-full" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Domain Owner</label>
              <input value={v.domainOwner} onChange={e => set("domainOwner", e.target.value)} className="field text-sm w-full" />
            </div>
          </div>
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
