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
  const code = req.reqCode ?? "";
  const m = code.match(/^([A-Z]+-\d+)/);
  if (m) return m[1];
  const firstDot = code.indexOf(".");
  const dotIdx = code.indexOf(".", firstDot + 1);
  if (firstDot > 0) {
    return dotIdx > 0 ? code.slice(0, dotIdx) : code.slice(0, firstDot + 2);
  }
  if (req.standard?.trim() && !hasArabic(req.standard)) return req.standard.trim();
  return req.domainCode ?? "General";
}

function complianceTypeLabel(raw: string | null | undefined) {
  if (!raw) return null;
  const isCompliance = raw.includes("امتثال") || raw.toLowerCase().includes("compliance");
  const isMaturity   = raw.includes("نضج")    || raw.toLowerCase().includes("maturity");
  if (!isCompliance && !isMaturity) return null;
  return { label: isCompliance ? "Compliance" : "Maturity", isCompliance };
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = {
  frameworks: ComplianceFramework[];
  users:      UserOption[];
};

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
  const [editing,     setEditing]     = useState<ComplianceRequirement | null>(null);
  const [saving,      setSaving]      = useState(false);

  // Filter state
  const [filterDomain,   setFilterDomain]   = useState("");
  const [filterStandard, setFilterStandard] = useState("");
  const [filterCode,     setFilterCode]     = useState("");
  const [filterLevel,    setFilterLevel]    = useState("");

  // Build domain display name map from domain config
  const domainNameMap = useMemo(() => {
    const map = new Map<string, string>();
    domainCfg.forEach(d => { if (d.domainCode) map.set(d.domainCode, d.nameEn); });
    return map;
  }, [domainCfg]);

  // Load levelCfg + configItems + requirements + domainCfg when fwId changes
  useEffect(() => {
    if (!fwId) return;
    setLoading(true);
    setReqs(null);
    setQ("");
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

  // Auto-translate missing EN fields
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

  // Derive unique filter options from loaded requirements
  const uniqueDomains = useMemo(() => {
    if (!reqs) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const r of reqs) {
      const code = r.domainCode ?? "";
      const label = r.domainCode
        ? (domainNameMap.get(r.domainCode) ?? r.domainEn ?? r.domain ?? r.domainCode)
        : (r.domainEn ?? r.domain ?? "");
      if (label && !seen.has(code || label)) {
        seen.add(code || label);
        out.push({ value: code || label, label });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [reqs, domainNameMap]);

  const uniqueStandards = useMemo(() => {
    if (!reqs) return [];
    const seen = new Set<string>();
    for (const r of reqs) seen.add(deriveStandard(r));
    return Array.from(seen).sort();
  }, [reqs]);

  const uniqueCodes = useMemo(() => {
    if (!reqs) return [];
    const seen = new Set<string>();
    for (const r of reqs) {
      const prefix = r.reqCode.split(".")[0];
      if (prefix) seen.add(prefix);
    }
    return Array.from(seen).sort();
  }, [reqs]);

  const uniqueLevels = useMemo(() => {
    if (!reqs) return [];
    const seen = new Set<string>();
    for (const r of reqs) {
      const lv = r.maturityLevel;
      if (lv != null && lv !== "") seen.add(String(lv));
    }
    return Array.from(seen).sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    });
  }, [reqs]);

  const filtered = useMemo(() => {
    if (!reqs) return [];
    const lq = q.toLowerCase();
    return reqs.filter(r => {
      if (lq && !(
        r.reqCode.toLowerCase().includes(lq) ||
        (r.supportingEvidenceEn ?? r.supportingEvidence ?? "").toLowerCase().includes(lq) ||
        (r.domainEn ?? r.domain ?? "").toLowerCase().includes(lq) ||
        deriveStandard(r).toLowerCase().includes(lq)
      )) return false;

      if (filterDomain) {
        const domVal = r.domainCode
          ? (domainNameMap.get(r.domainCode) ?? r.domainEn ?? r.domain ?? r.domainCode)
          : (r.domainEn ?? r.domain ?? "");
        const domKey = r.domainCode || domVal;
        if (domKey !== filterDomain) return false;
      }

      if (filterStandard && deriveStandard(r) !== filterStandard) return false;

      if (filterCode) {
        const prefix = r.reqCode.split(".")[0];
        if (prefix !== filterCode) return false;
      }

      if (filterLevel && String(r.maturityLevel) !== filterLevel) return false;

      return true;
    });
  }, [reqs, q, filterDomain, filterStandard, filterCode, filterLevel, domainNameMap]);

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
        </div>
      )}
      {frameworks.length === 1 && (
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-purple/10 text-brand-purple text-sm font-semibold">
            {frameworks[0].name}
            {frameworks[0].version && <span className="text-brand-purple/60 font-normal">· {frameworks[0].version}</span>}
          </span>
        </div>
      )}

      {/* Search + filters bar */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            value={q} onChange={e => setQ(e.target.value)}
            className="field text-sm flex-1"
            placeholder="Search by code, domain, standard, evidence…"
          />
          {translating > 0 && (
            <span className="text-brand-purple animate-pulse text-[11px] shrink-0">
              Translating {translating} missing EN fields…
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wide shrink-0">Filter:</span>

          <select
            value={filterDomain}
            onChange={e => setFilterDomain(e.target.value)}
            className="field text-sm py-1.5 w-auto min-w-[160px]"
          >
            <option value="">All Domains</option>
            {uniqueDomains.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>

          <select
            value={filterStandard}
            onChange={e => setFilterStandard(e.target.value)}
            className="field text-sm py-1.5 w-auto min-w-[140px]"
          >
            <option value="">All Standards</option>
            {uniqueStandards.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterCode}
            onChange={e => setFilterCode(e.target.value)}
            className="field text-sm py-1.5 w-auto min-w-[130px]"
          >
            <option value="">All Codes</option>
            {uniqueCodes.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
            className="field text-sm py-1.5 w-auto min-w-[130px]"
          >
            <option value="">All Levels</option>
            {uniqueLevels.map(lv => {
              const cfg = levelCfg.find(l => String(l.levelNum) === lv);
              return (
                <option key={lv} value={lv}>
                  Level {lv}{cfg ? ` — ${cfg.name}` : ""}
                </option>
              );
            })}
          </select>

          {(filterDomain || filterStandard || filterCode || filterLevel || q) && (
            <button
              onClick={() => { setFilterDomain(""); setFilterStandard(""); setFilterCode(""); setFilterLevel(""); setQ(""); }}
              className="text-[11px] text-muted hover:text-brand-purple font-semibold"
            >
              Clear all
            </button>
          )}

          <span className="ml-auto text-[11px] text-muted">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {loading && <div className="card p-8 text-center text-muted text-sm">Loading requirements…</div>}

      {!loading && reqs !== null && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="border-b border-line bg-canvas-soft text-left">
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-28">Code</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24">Standard</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-44">Domain</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Supporting Evidence</th>
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-16">Level</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map(req => {
                  const evidenceEn = req.supportingEvidenceEn ?? req.questionEn ?? "";
                  const needsTranslation = !req.supportingEvidenceEn && !!req.supportingEvidence && hasArabic(req.supportingEvidence);
                  // Use domain config for display name
                  const domainDisplay = req.domainCode
                    ? (domainNameMap.get(req.domainCode) ?? req.domainEn ?? req.domain ?? "—")
                    : (req.domainEn ?? req.domain ?? "—");
                  return (
                    <tr key={req.reqId} className="border-b border-line-soft hover:bg-canvas/30">
                      <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-muted">{req.reqCode}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted">{deriveStandard(req)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-ink">
                        <div>{domainDisplay}</div>
                        {req.domainCode && <div className="text-[10px] text-muted font-mono">{req.domainCode}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-ink-soft max-w-[340px] truncate" title={evidenceEn || undefined}>
                        {needsTranslation
                          ? <span className="text-muted/50 italic text-[11px]">Translating…</span>
                          : evidenceEn
                            ? (evidenceEn.length > 90 ? evidenceEn.slice(0, 88) + "…" : evidenceEn)
                            : <span className="text-muted/40 italic">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted">{req.maturityLevel ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setEditing(req)}
                          className="text-[11px] text-brand-purple hover:text-brand-deep font-semibold">Edit</button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted italic">No requirements match.</td></tr>
                )}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <div className="px-4 py-2 text-[11px] text-muted text-center border-t border-line">
                Showing first 200 of {filtered.length}. Narrow your search to see more.
              </div>
            )}
          </div>
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
  const initCompCode = resolveComplianceCode(req.complianceOrMaturity);

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
  // Separate state for the compliance type code (maps to label for saving)
  const [compCode, setCompCode] = useState(initCompCode);

  function set(k: keyof typeof v, val: string) { setV(p => ({ ...p, [k]: val })); }

  // When compCode changes, update v.complianceOrMaturity to the English label (what DB stores)
  function handleCompCodeChange(code: string) {
    setCompCode(code);
    const item = complianceTypeItems.find(i => i.code === code);
    setV(p => ({ ...p, complianceOrMaturity: item?.label ?? code }));
  }

  // Selected compliance type item for AR display
  const selectedCompItem = complianceTypeItems.find(i => i.code === compCode);
  // Selected level config for AR name display
  const selectedLevel = levelCfg.find(lc => String(lc.levelNum) === v.maturityLevel);

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
          {/* Column headers */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line pb-2 mb-1">
            <div className="text-[10px] font-bold text-brand-purple uppercase tracking-wide">English (EN)</div>
            <div className="text-[10px] font-bold text-brand-purple uppercase tracking-wide text-right" dir="rtl">العربية (AR)</div>
          </div>

          {/* Bilingual text fields */}
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

          {/* Other fields */}
          <div className="border-t border-line pt-4 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Evidence Code</label>
              <input value={v.directoryCode} onChange={e => set("directoryCode", e.target.value)} className="field text-sm w-full" />
            </div>

            {/* Compliance or Maturity — bilingual display */}
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

            {/* Maturity Level — bilingual display */}
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
