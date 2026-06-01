"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/lang-context";
import type {
  ComplianceFramework, LevelConfig, ConfigItem, DomainConfig,
} from "@/lib/queries/gov-compliance";

const DEFAULT_COLORS = ["#D84848","#E88030","#2D4AA0","#3D7EC8","#1E8C76","#5CA85C"];
const DEFAULT_NAMES  = ["No Capability","Build","Definition","Activation","Managed","Innovation"];

const CGROUP_LABELS: Record<string, string> = {
  STATUS:          "Submission Statuses",
  EVIDENCE_TYPE:   "Evidence Types",
  COMPLIANCE_TYPE: "Compliance Types",
};

function blankLevels(fwId: number): LevelConfig[] {
  return Array.from({ length: 6 }, (_, i) => ({
    configId: 0, frameworkId: fwId, levelNum: i,
    name: DEFAULT_NAMES[i], nameAr: null,
    colorHex: DEFAULT_COLORS[i], description: null, descriptionAr: null,
    rangeFrom: null, rangeTo: null,
  }));
}

export function ComplianceConfigSection() {
  const { secondaryLangDef } = useLang();
  const secondaryLangCode = secondaryLangDef.code;

  const [frameworks,   setFrameworks]   = useState<ComplianceFramework[]>([]);
  const [fwId,         setFwId]         = useState<number | null>(null);
  const [levelCfg,     setLevelCfg]     = useState<LevelConfig[]>([]);
  const [configItems,  setConfigItems]  = useState<ConfigItem[]>([]);
  const [domainConfig, setDomainConfig] = useState<DomainConfig[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [cfgSaving,    setCfgSaving]    = useState(false);

  useEffect(() => {
    fetch("/api/governance/compliance")
      .then(r => r.json())
      .then((fws: ComplianceFramework[]) => {
        setFrameworks(fws);
        if (fws.length > 0) setFwId(fws[0].frameworkId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!fwId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/governance/compliance/${fwId}/config`).then(r => r.json()),
      fetch(`/api/governance/compliance/${fwId}/config-items`).then(r => r.json()),
      fetch(`/api/governance/compliance/${fwId}/domain-config`).then(r => r.json()),
    ]).then(([levels, ciData, dcData]) => {
      setLevelCfg((levels as LevelConfig[]).length > 0 ? levels : blankLevels(fwId));
      setConfigItems(ciData.items ?? []);
      setDomainConfig(dcData.configs ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [fwId]);

  async function saveLevels(rows: LevelConfig[]) {
    if (!fwId) return;
    setCfgSaving(true);
    await fetch(`/api/governance/compliance/${fwId}/config`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levels: rows }),
    });
    setLevelCfg(rows);
    setCfgSaving(false);
  }

  return (
    <div className="max-w-5xl">
      {/* Framework selector */}
      <div className="flex items-center gap-3 mb-8">
        {frameworks.length > 1 ? (
          <>
            <span className="text-sm font-semibold text-ink-soft">Framework</span>
            <select value={fwId ?? ""} onChange={e => setFwId(Number(e.target.value))} className="input text-sm w-auto">
              {frameworks.map(fw => (
                <option key={fw.frameworkId} value={fw.frameworkId}>{fw.name}</option>
              ))}
            </select>
          </>
        ) : frameworks.length === 1 ? (
          <span className="text-[11px] font-semibold text-brand-deep bg-brand-purple/10 px-3 py-1.5 rounded font-mono">
            {frameworks[0].name}
          </span>
        ) : null}
      </div>

      {loading && <div className="card p-8 text-center text-sm text-muted">Loading…</div>}

      {!loading && fwId && (
        <div className="space-y-10">
          <LevelConfigSection levelCfg={levelCfg} frameworkId={fwId} saving={cfgSaving} onSave={saveLevels} secondaryLangCode={secondaryLangCode} />

          {(["STATUS","EVIDENCE_TYPE","COMPLIANCE_TYPE"] as const).map(group => (
            <ConfigItemsGroup
              key={group}
              group={group}
              frameworkId={fwId}
              items={configItems.filter(i => i.configGroup === group)}
              onUpdate={updated => {
                setConfigItems(prev => [...prev.filter(i => i.configGroup !== group), ...updated]);
              }}
            />
          ))}

          <DomainConfigGroup frameworkId={fwId} configs={domainConfig} onUpdate={setDomainConfig} secondaryLangCode={secondaryLangCode} />
        </div>
      )}
    </div>
  );
}

// ── Level Config ──────────────────────────────────────────────────────────────

function LevelConfigSection({ levelCfg, frameworkId, saving, onSave, secondaryLangCode }: {
  levelCfg: LevelConfig[]; frameworkId: number; saving: boolean;
  onSave: (rows: LevelConfig[]) => void; secondaryLangCode: string;
}) {
  const [rows,        setRows]        = useState<LevelConfig[]>(levelCfg);
  const [translating, setTranslating] = useState(false);
  const [translateMsg, setTranslateMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { setRows(levelCfg); }, [levelCfg]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(levelCfg);

  function update(ln: number, field: keyof LevelConfig, val: string | number | null) {
    setRows(p => p.map(r => r.levelNum === ln ? { ...r, [field]: val } : r));
  }

  async function autoTranslate() {
    setTranslating(true);
    setTranslateMsg(null);
    const updated = rows.map(r => ({ ...r }));
    let count = 0;
    let lastError = "";
    for (const row of updated) {
      // Translate name if present
      if (row.name) {
        try {
          const res = await fetch(`/api/governance/compliance/${frameworkId}/translate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: row.name, targetLang: secondaryLangCode }),
          });
          const d = await res.json();
          if (d.translation) { row.nameAr = d.translation; count++; }
          else if (d.error)   { lastError = d.error; }
        } catch (e) { lastError = String(e); }
      }
      // Translate description if present
      if (row.description) {
        try {
          const res = await fetch(`/api/governance/compliance/${frameworkId}/translate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: row.description, targetLang: secondaryLangCode }),
          });
          const d = await res.json();
          if (d.translation) { row.descriptionAr = d.translation; count++; }
          else if (d.error)   { lastError = d.error; }
        } catch (e) { lastError = String(e); }
      }
    }
    setRows(updated);
    setTranslating(false);
    if (lastError) {
      setTranslateMsg({ type: "err", text: lastError });
    } else if (count > 0) {
      setTranslateMsg({ type: "ok", text: `Translated ${count} field${count !== 1 ? "s" : ""}` });
      setTimeout(() => setTranslateMsg(null), 4000);
    } else {
      setTranslateMsg({ type: "err", text: "Nothing to translate — add names or descriptions first." });
      setTimeout(() => setTranslateMsg(null), 4000);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-brand-deep">Maturity Levels</h3>
          <p className="text-sm text-ink-soft">Names, colours, descriptions, and score ranges for each maturity level (0.00–5.00).</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={autoTranslate} disabled={translating || saving} className="btn btn-sm">
            {translating ? "Translating…" : `Auto-translate ${secondaryLangCode.toUpperCase()}`}
          </button>
          {translateMsg && (
            <span className={`text-[11px] font-semibold ${translateMsg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {translateMsg.text}
            </span>
          )}
          {dirty && (
            <button onClick={() => onSave(rows)} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-line bg-canvas-soft text-left">
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-14">Level</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-10">Colour</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-32">Name (EN)</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-32">الاسم (AR)</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Description (EN)</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">الوصف (AR)</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24 text-center">Range From</th>
              <th className="px-3 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24 text-center">Range To</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.levelNum} className="border-b border-line-soft">
                <td className="px-3 py-2">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-extrabold text-base"
                    style={{ backgroundColor: row.colorHex }}>{row.levelNum}</span>
                </td>
                <td className="px-3 py-2">
                  <input type="color" value={row.colorHex}
                    onChange={e => update(row.levelNum, "colorHex", e.target.value)}
                    className="w-9 h-9 rounded-lg cursor-pointer border border-line p-0.5" />
                </td>
                <td className="px-3 py-2">
                  <input value={row.name} onChange={e => update(row.levelNum, "name", e.target.value)}
                    className="input w-full text-sm" placeholder="Level name…" />
                </td>
                <td className="px-3 py-2">
                  <input value={row.nameAr ?? ""} onChange={e => update(row.levelNum, "nameAr", e.target.value)}
                    className="input w-full text-sm text-right" dir="rtl" placeholder="اسم المستوى…" />
                </td>
                <td className="px-3 py-2">
                  <input value={row.description ?? ""} onChange={e => update(row.levelNum, "description", e.target.value)}
                    className="input w-full text-sm" placeholder="Brief description…" />
                </td>
                <td className="px-3 py-2">
                  <input value={row.descriptionAr ?? ""} onChange={e => update(row.levelNum, "descriptionAr", e.target.value)}
                    className="input w-full text-sm text-right" dir="rtl" placeholder="وصف مختصر…" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} max={5} step={0.01}
                    value={row.rangeFrom ?? ""}
                    onChange={e => update(row.levelNum, "rangeFrom", e.target.value === "" ? null : Number(e.target.value))}
                    className="input w-full text-sm text-center" placeholder="0.00" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} max={5} step={0.01}
                    value={row.rangeTo ?? ""}
                    onChange={e => update(row.levelNum, "rangeTo", e.target.value === "" ? null : Number(e.target.value))}
                    className="input w-full text-sm text-center" placeholder="5.00" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Config Items (Status / Evidence Type / Compliance Type) ───────────────────

function ConfigItemsGroup({ group, frameworkId, items, onUpdate }: {
  group: string; frameworkId: number; items: ConfigItem[];
  onUpdate: (items: ConfigItem[]) => void;
}) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [addCode,    setAddCode]    = useState("");
  const [addLabel,   setAddLabel]   = useState("");
  const [addLabelAr, setAddLabelAr] = useState("");
  const [addColor,   setAddColor]   = useState("#6B7280");
  const [adding,     setAdding]     = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm,    setEditForm]  = useState({ label: "", labelAr: "", colorHex: "#6B7280" });
  const [editSaving,  setEditSaving]= useState(false);

  function startEdit(item: ConfigItem) {
    setEditingCode(item.code);
    setEditForm({ label: item.label, labelAr: item.labelAr ?? "", colorHex: item.colorHex ?? "#6B7280" });
  }

  async function saveEdit(code: string) {
    setEditSaving(true);
    const item = items.find(i => i.code === code)!;
    await fetch(`/api/governance/compliance/${frameworkId}/config-items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configGroup: group, code,
        label: editForm.label.trim(), labelAr: editForm.labelAr.trim() || null,
        colorHex: editForm.colorHex, sortOrder: item.sortOrder,
      }),
    });
    onUpdate(items.map(i => i.code === code
      ? { ...i, label: editForm.label.trim(), labelAr: editForm.labelAr.trim() || null, colorHex: editForm.colorHex }
      : i
    ));
    setEditingCode(null);
    setEditSaving(false);
  }

  async function add() {
    if (!addCode.trim() || !addLabel.trim()) return;
    setAdding(true);
    await fetch(`/api/governance/compliance/${frameworkId}/config-items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configGroup: group, code: addCode.trim(), label: addLabel.trim(),
        labelAr: addLabelAr.trim() || null, colorHex: addColor, sortOrder: items.length + 1,
      }),
    });
    onUpdate([...items, {
      itemId: Date.now(), configGroup: group, code: addCode.trim(),
      label: addLabel.trim(), labelAr: addLabelAr.trim() || null,
      colorHex: addColor, sortOrder: items.length + 1,
    }]);
    setAddCode(""); setAddLabel(""); setAddLabelAr(""); setShowAdd(false); setAdding(false);
  }

  async function del(code: string) {
    if (!confirm(`Delete "${code}"?`)) return;
    await fetch(`/api/governance/compliance/${frameworkId}/config-items`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configGroup: group, code }),
    });
    onUpdate(items.filter(i => i.code !== code));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-brand-deep">{CGROUP_LABELS[group] ?? group}</h3>
          <p className="text-sm text-ink-soft">Configure list values used in this framework.</p>
        </div>
        <button onClick={() => { setShowAdd(v => !v); setEditingCode(null); }} className="btn btn-sm">
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 mb-4 bg-canvas-soft/50 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Code</label>
              <input value={addCode} onChange={e => setAddCode(e.target.value)}
                className="input w-full text-sm" placeholder="CODE" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN)</label>
              <input value={addLabel} onChange={e => setAddLabel(e.target.value)}
                className="input w-full text-sm" placeholder="English" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">التسمية (AR)</label>
              <input value={addLabelAr} onChange={e => setAddLabelAr(e.target.value)}
                className="input w-full text-sm text-right" dir="rtl" placeholder="العربية" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="color" value={addColor} onChange={e => setAddColor(e.target.value)}
              className="w-9 h-9 rounded-lg cursor-pointer border border-line p-0.5" />
            <button onClick={add} disabled={adding || !addCode.trim() || !addLabel.trim()}
              className="btn btn-sm btn-primary">{adding ? "Adding…" : "Add"}</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[36px_110px_1fr_1fr_100px] gap-3 px-4 py-2.5 bg-canvas-soft border-b border-line text-[10px] uppercase tracking-wider text-muted font-bold">
          <div></div><div>Code</div><div>English Label</div><div>Arabic Label (عربي)</div><div></div>
        </div>
        {[...items].sort((a, b) => a.sortOrder - b.sortOrder).map(item => (
          <div key={item.code} className="border-b border-line-soft last:border-b-0">
            {editingCode === item.code ? (
              <div className="px-4 py-3 bg-blue-50/40 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[11px] text-brand-deep font-semibold bg-brand-purple/10 px-2 py-0.5 rounded">{item.code}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN)</label>
                    <input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                      className="input w-full text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">التسمية (AR)</label>
                    <input value={editForm.labelAr} onChange={e => setEditForm(f => ({ ...f, labelAr: e.target.value }))}
                      className="input w-full text-sm text-right" dir="rtl" />
                  </div>
                  <div className="flex items-end gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Colour</label>
                      <input type="color" value={editForm.colorHex}
                        onChange={e => setEditForm(f => ({ ...f, colorHex: e.target.value }))}
                        className="w-9 h-9 rounded-lg cursor-pointer border border-line p-0.5" />
                    </div>
                    <button onClick={() => saveEdit(item.code)} disabled={editSaving || !editForm.label.trim()}
                      className="btn btn-sm btn-primary mb-0.5">{editSaving ? "Saving…" : "Save"}</button>
                    <button onClick={() => setEditingCode(null)} className="btn btn-sm mb-0.5">Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[36px_110px_1fr_1fr_100px] gap-3 px-4 py-3 items-center hover:bg-canvas-soft">
                <div>
                  <span className="w-5 h-5 rounded-full inline-block border border-line"
                    style={{ backgroundColor: item.colorHex ?? "#6B7280" }} />
                </div>
                <div className="font-mono text-[11px] text-muted font-semibold">{item.code}</div>
                <div className="font-medium text-sm text-ink">{item.label}</div>
                <div className="text-sm text-ink text-right" dir="rtl">
                  {item.labelAr ?? <span className="text-muted italic text-[11px]">Not set</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(item)}
                    className="text-[11px] text-brand-purple hover:text-brand-deep font-semibold">Edit</button>
                  <button onClick={() => del(item.code)}
                    className="text-[11px] text-red-500 hover:text-red-700 font-semibold">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted italic">No items configured.</div>
        )}
      </div>
    </div>
  );
}

// ── Domain Config ─────────────────────────────────────────────────────────────

function DomainConfigGroup({ frameworkId, configs, onUpdate, secondaryLangCode }: {
  frameworkId: number; configs: DomainConfig[]; onUpdate: (c: DomainConfig[]) => void; secondaryLangCode: string;
}) {
  const [rows,        setRows]        = useState<DomainConfig[]>(configs);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [addCode,     setAddCode]     = useState("");
  const [addNameEn,   setAddNameEn]   = useState("");
  const [addNameAr,   setAddNameAr]   = useState("");
  const [addDescEn,   setAddDescEn]   = useState("");
  const [addDescAr,   setAddDescAr]   = useState("");
  const [addWeight,   setAddWeight]   = useState("");

  useEffect(() => { setRows(configs); setDirty(false); }, [configs]);

  function updateRow(idx: number, field: keyof DomainConfig, val: string | number | null) {
    setRows(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    setDirty(true);
  }

  async function saveAll() {
    setSaving(true);
    for (const row of rows) {
      await fetch(`/api/governance/compliance/${frameworkId}/domain-config`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainCode: row.domainCode, nameEn: row.nameEn, nameAr: row.nameAr ?? null,
          descriptionEn: row.descriptionEn ?? null, descriptionAr: row.descriptionAr ?? null,
          sortOrder: row.sortOrder, weight: row.weight ?? null,
        }),
      });
    }
    onUpdate(rows);
    setDirty(false);
    setSaving(false);
  }

  async function deleteRow(configId: number) {
    if (!confirm("Delete this domain config?")) return;
    await fetch(`/api/governance/compliance/${frameworkId}/domain-config`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configId }),
    });
    const updated = rows.filter(r => r.configId !== configId);
    setRows(updated);
    onUpdate(updated);
  }

  async function addRow() {
    if (!addCode.trim() || !addNameEn.trim()) return;
    const res = await fetch(`/api/governance/compliance/${frameworkId}/domain-config`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domainCode: addCode.trim(), nameEn: addNameEn.trim(), nameAr: addNameAr.trim() || null,
        descriptionEn: addDescEn.trim() || null, descriptionAr: addDescAr.trim() || null,
        sortOrder: rows.length, weight: addWeight ? Number(addWeight) : null,
      }),
    });
    const data = await res.json();
    const newRow: DomainConfig = {
      configId: data.id, frameworkId, domainCode: addCode.trim(),
      nameEn: addNameEn.trim(), nameAr: addNameAr.trim() || null,
      descriptionEn: addDescEn.trim() || null, descriptionAr: addDescAr.trim() || null,
      sortOrder: rows.length, weight: addWeight ? Number(addWeight) : null,
    };
    const updated = [...rows, newRow];
    setRows(updated);
    onUpdate(updated);
    setAddCode(""); setAddNameEn(""); setAddNameAr(""); setAddDescEn(""); setAddDescAr(""); setAddWeight(""); setShowAdd(false);
  }

  async function autoTranslate() {
    setTranslating(true);
    const updated = rows.map(r => ({ ...r }));
    for (const row of updated) {
      try {
        if (row.nameEn && !row.nameAr) {
          const r = await fetch(`/api/governance/compliance/${frameworkId}/translate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: row.nameEn, targetLang: secondaryLangCode }),
          });
          const d = await r.json();
          if (d.translation) row.nameAr = d.translation;
        }
        if (row.descriptionEn && !row.descriptionAr) {
          const r = await fetch(`/api/governance/compliance/${frameworkId}/translate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: row.descriptionEn, targetLang: secondaryLangCode }),
          });
          const d = await r.json();
          if (d.translation) row.descriptionAr = d.translation;
        }
      } catch {}
    }
    setRows([...updated]);
    setDirty(true);
    setTranslating(false);
  }

  // Total weight display
  const totalWeight = rows.reduce((s, r) => s + (r.weight ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-brand-deep">Domain Configuration</h3>
          <p className="text-sm text-ink-soft">
            Display names and weights for each compliance domain.
            {rows.some(r => r.weight != null) && (
              <span className={`ml-2 font-semibold text-[12px] ${Math.abs(totalWeight - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
                Total weight: {totalWeight.toFixed(1)}%
                {Math.abs(totalWeight - 100) > 0.01 && " (should sum to 100%)"}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={autoTranslate} disabled={translating || saving} className="btn btn-sm">
            {translating ? "Translating…" : `Auto-translate ${secondaryLangCode.toUpperCase()}`}
          </button>
          <button onClick={() => setShowAdd(v => !v)} className="btn btn-sm">
            {showAdd ? "Cancel" : "+ Add"}
          </button>
          {dirty && (
            <button onClick={saveAll} disabled={saving} className="btn btn-sm btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="card p-4 mb-4 bg-canvas-soft/50 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Domain Code</label>
              <input value={addCode} onChange={e => setAddCode(e.target.value)}
                className="input w-full text-sm" placeholder="DG" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Name (EN)</label>
              <input value={addNameEn} onChange={e => setAddNameEn(e.target.value)}
                className="input w-full text-sm" placeholder="Data Governance" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">الاسم (AR)</label>
              <input value={addNameAr} onChange={e => setAddNameAr(e.target.value)}
                className="input w-full text-sm text-right" dir="rtl" placeholder="حوكمة البيانات" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Weight (%)</label>
              <input type="number" min={0} max={100} step={0.01} value={addWeight}
                onChange={e => setAddWeight(e.target.value)}
                className="input w-full text-sm" placeholder="e.g. 10" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description (EN)</label>
              <input value={addDescEn} onChange={e => setAddDescEn(e.target.value)}
                className="input w-full text-sm" />
            </div>
            <div className="col-span-3">
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">الوصف (AR)</label>
              <input value={addDescAr} onChange={e => setAddDescAr(e.target.value)}
                className="input w-full text-sm text-right" dir="rtl" />
            </div>
          </div>
          <button onClick={addRow} disabled={!addCode.trim() || !addNameEn.trim()}
            className="btn btn-sm btn-primary">Add</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[70px_1fr_1fr_1fr_1fr_80px_60px] gap-2 px-4 py-2.5 bg-canvas-soft border-b border-line text-[10px] uppercase tracking-wider text-muted font-bold">
          <div>Code</div><div>Name EN</div><div>الاسم AR</div><div>Description EN</div><div>الوصف AR</div>
          <div className="text-center">Weight %</div><div></div>
        </div>
        {rows.map((row, idx) => (
          <div key={row.configId} className="grid grid-cols-[70px_1fr_1fr_1fr_1fr_80px_60px] gap-2 px-4 py-2 items-center border-b border-line-soft last:border-b-0">
            <div className="font-mono text-[11px] font-bold text-muted">{row.domainCode}</div>
            <input value={row.nameEn} onChange={e => updateRow(idx, "nameEn", e.target.value)}
              className="input w-full text-sm" />
            <input value={row.nameAr ?? ""} onChange={e => updateRow(idx, "nameAr", e.target.value)}
              className="input w-full text-sm text-right" dir="rtl" />
            <input value={row.descriptionEn ?? ""} onChange={e => updateRow(idx, "descriptionEn", e.target.value)}
              className="input w-full text-sm" />
            <input value={row.descriptionAr ?? ""} onChange={e => updateRow(idx, "descriptionAr", e.target.value)}
              className="input w-full text-sm text-right" dir="rtl" />
            <div className="flex items-center gap-0.5">
              <input type="number" min={0} max={100} step={0.01}
                value={row.weight ?? ""}
                onChange={e => updateRow(idx, "weight", e.target.value === "" ? null : Number(e.target.value))}
                className="input w-full text-sm text-center" placeholder="—" />
              <span className="text-muted text-[11px] shrink-0">%</span>
            </div>
            <div>
              <button onClick={() => deleteRow(row.configId)}
                className="text-[11px] text-red-500 hover:text-red-700 font-semibold">Delete</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted italic">No domains configured.</div>
        )}
      </div>
    </div>
  );
}
