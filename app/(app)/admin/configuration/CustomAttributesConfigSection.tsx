"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CustomAttributeDefinition, CustomAttributeAssetType, CustomAttributeDataType } from "@/lib/types";

const ASSET_TYPE_LABELS: Record<CustomAttributeAssetType, string> = {
  DATA_SOURCES:      "Data Sources",
  DATA_SCHEMAS:      "Schemas",
  DATA_ENTITIES:     "Tables",
  DATA_ATTRIBUTES:   "Columns",
  BUSINESS_GLOSSARIES: "Business Terms",
};
const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as CustomAttributeAssetType[];

const DATA_TYPE_LABELS: Record<CustomAttributeDataType, string> = {
  TEXT: "Text", LONGTEXT: "Long Text", NUMBER: "Number", DATE: "Date",
  BOOLEAN: "Yes/No", ENUM: "Dropdown", USER: "User", URL: "URL",
};
const DATA_TYPES = Object.keys(DATA_TYPE_LABELS) as CustomAttributeDataType[];

const BLANK = {
  attrCode: "", attrName: "", dataType: "TEXT" as CustomAttributeDataType,
  enumValuesText: "", isRequired: false, displayOrder: 0,
};

export function CustomAttributesConfigSection() {
  const [defs, setDefs] = useState<CustomAttributeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<CustomAttributeAssetType>("DATA_ENTITIES");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/custom-attributes");
    setDefs(r.ok ? await r.json() : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const inType = defs.filter((d) => d.assetType === activeType);

  async function handleAdd() {
    setErr("");
    if (!form.attrCode.trim() || !form.attrName.trim()) { setErr("Code and Name are required"); return; }
    const enumValues = form.dataType === "ENUM"
      ? form.enumValuesText.split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    if (form.dataType === "ENUM" && (!enumValues || enumValues.length === 0)) { setErr("Provide at least one dropdown option"); return; }

    setSaving(true);
    try {
      const r = await fetch("/api/admin/custom-attributes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: activeType,
          attrCode: form.attrCode,
          attrName: form.attrName,
          dataType: form.dataType,
          enumValues,
          isRequired: form.isRequired,
          displayOrder: form.displayOrder,
        }),
      });
      if (!r.ok) { const e = await r.json(); setErr(e.error ?? "Failed to add field"); return; }
      setAdding(false);
      setForm({ ...BLANK });
      await load();
    } finally { setSaving(false); }
  }

  async function handleToggleEnabled(d: CustomAttributeDefinition) {
    await fetch(`/api/admin/custom-attributes/${d.attrDefId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !d.isEnabled }),
    });
    await load();
  }

  async function handleDelete(d: CustomAttributeDefinition) {
    if (!confirm(`Delete "${d.attrName}"? Any values already saved for it will no longer be shown.`)) return;
    await fetch(`/api/admin/custom-attributes/${d.attrDefId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Custom Attributes</h2>
        <p className="text-xs text-muted mt-1">
          Define extra metadata fields for each asset level. Once defined, a field
          becomes editable on every asset of that level — a table, column, schema,
          data source, or business term.
        </p>
      </div>

      <div className="flex gap-1 border-b border-line mb-6">
        {ASSET_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => { setActiveType(t); setAdding(false); }}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              activeType === t ? "text-brand-purple border-brand-purple" : "text-ink-soft border-transparent hover:text-brand-purple"
            }`}
          >
            {ASSET_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted font-mono">{activeType} · {inType.length} field{inType.length === 1 ? "" : "s"}</p>
        <button onClick={() => { setAdding(true); setForm({ ...BLANK }); setErr(""); }} className="btn btn-primary btn-sm">+ Add Field</button>
      </div>

      {adding && (
        <div className="bg-white border border-brand-purple rounded-xl p-5 mb-4 space-y-4">
          <h3 className="text-sm font-semibold text-ink">New Field on {ASSET_TYPE_LABELS[activeType]}</h3>
          {err && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-md">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Code *</label>
              <input className="input w-full font-mono" placeholder="OWNER_TEAM" value={form.attrCode}
                onChange={(e) => setForm((f) => ({ ...f, attrCode: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Type *</label>
              <select className="input w-full" value={form.dataType}
                onChange={(e) => setForm((f) => ({ ...f, dataType: e.target.value as CustomAttributeDataType }))}>
                {DATA_TYPES.map((t) => <option key={t} value={t}>{DATA_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN) *</label>
              <input className="input w-full" placeholder="Owning Team" value={form.attrName}
                onChange={(e) => setForm((f) => ({ ...f, attrName: e.target.value }))} />
              <p className="text-[11px] text-muted mt-1">
                Arabic and any other enabled language are added afterward in{" "}
                <Link href="/admin/languages" className="text-brand-purple hover:underline">Administration → Languages → Workbench</Link>.
              </p>
            </div>
            {form.dataType === "ENUM" && (
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Dropdown Options (comma-separated) *</label>
                <input className="input w-full" placeholder="Finance, Marketing, Engineering" value={form.enumValuesText}
                  onChange={(e) => setForm((f) => ({ ...f, enumValuesText: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Sort Order</label>
              <input type="number" className="input w-full" value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={form.isRequired} className="w-4 h-4 accent-brand-purple"
                onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} />
              <label className="text-sm text-ink">Required</label>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Add"}</button>
            <button onClick={() => setAdding(false)} className="btn btn-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_110px_70px_80px] gap-3 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div>Code</div><div>Label</div><div>Type</div><div>Required</div><div>Actions</div>
        </div>
        {loading && <div className="py-8 text-center text-muted text-sm">Loading…</div>}
        {!loading && inType.map((d) => (
          <div key={d.attrDefId} className={`grid grid-cols-[100px_1fr_110px_70px_80px] gap-3 px-5 py-3 items-center border-b border-line-soft last:border-b-0 hover:bg-canvas-soft ${!d.isEnabled ? "opacity-50" : ""}`}>
            <div className="font-mono text-[11px] text-brand-deep font-semibold">{d.attrCode}</div>
            <div className="text-sm text-ink font-medium">{d.attrName}</div>
            <div className="text-xs text-muted">{DATA_TYPE_LABELS[d.dataType]}</div>
            <div className="text-center text-sm">{d.isRequired ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-400">✗</span>}</div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => handleToggleEnabled(d)} className="btn btn-sm text-xs">{d.isEnabled ? "Disable" : "Enable"}</button>
              <button onClick={() => handleDelete(d)} className="btn btn-sm text-xs text-red-600 hover:bg-red-50">Del</button>
            </div>
          </div>
        ))}
        {!loading && inType.length === 0 && (
          <div className="py-10 text-center text-muted text-sm">No custom fields defined for {ASSET_TYPE_LABELS[activeType].toLowerCase()} yet.</div>
        )}
      </div>
    </div>
  );
}
