"use client";

import { BuiltinFieldMappings } from "./BuiltinFieldMappings";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { CustomAttributeDefinition, CustomAttributeAssetType, CustomAttributeDataType, CustomAttributeSourceMapping } from "@/lib/types";

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

// Source systems a crawl can read attribute values from (db/141). SQL Server also
// covers Azure SQL Managed Instance and Azure SQL Database (same engine).
const SOURCE_TYPES: { code: CustomAttributeSourceMapping["sourceTypeCode"]; label: string }[] = [
  { code: "MSSQL",    label: "SQL Server / Azure SQL / Managed Instance" },
  { code: "POSTGRES", label: "PostgreSQL" },
  { code: "ORACLE",   label: "Oracle" },
  { code: "MYSQL",    label: "MySQL" },
];
const SOURCE_SHORT: Record<string, string> = { MSSQL: "SQL Server", POSTGRES: "PostgreSQL", ORACLE: "Oracle", MYSQL: "MySQL" };
const MAPPABLE: CustomAttributeAssetType[] = ["DATA_ENTITIES", "DATA_ATTRIBUTES"];

function ActionIcon({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-8 h-8 grid place-items-center rounded-md border border-line transition-colors ${
        danger ? "text-red-600 hover:bg-red-50 hover:border-red-200" : "text-ink-soft hover:text-brand-purple hover:bg-brand-purple/5 hover:border-brand-purple/30"
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

type MappingDraft = Record<string, { methodCode: CustomAttributeSourceMapping["methodCode"]; sourceKey: string }>;

const BLANK = {
  attrCode: "", attrName: "", dataType: "TEXT" as CustomAttributeDataType,
  enumValuesText: "", isRequired: false, displayOrder: 0,
};

export function CustomAttributesConfigSection() {
  const [defs, setDefs] = useState<CustomAttributeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<CustomAttributeAssetType>("DATA_ENTITIES");
  const [adding, setAdding] = useState(false);
  // Set when the form edits an existing field instead of adding one.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [mapping, setMapping] = useState<{ def: CustomAttributeDefinition; draft: MappingDraft } | null>(null);
  const [mapErr, setMapErr] = useState("");

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
      const r = editingId != null
        // Code and type stay fixed once created: saved values are keyed by the code and stored in that type.
        ? await fetch(`/api/admin/custom-attributes/${editingId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attrName: form.attrName.trim(), enumValues, isRequired: form.isRequired, displayOrder: form.displayOrder }),
          })
        : await fetch("/api/admin/custom-attributes", {
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
      if (!r.ok) { const e = await r.json().catch(() => ({})); setErr(e.error ?? (editingId != null ? "Failed to save field" : "Failed to add field")); return; }
      setAdding(false);
      setEditingId(null);
      setForm({ ...BLANK });
      await load();
    } finally { setSaving(false); }
  }

  function startEdit(d: CustomAttributeDefinition) {
    setForm({
      attrCode: d.attrCode, attrName: d.attrName, dataType: d.dataType,
      enumValuesText: (d.enumValues ?? []).join(", "), isRequired: d.isRequired, displayOrder: d.displayOrder,
    });
    setEditingId(d.attrDefId);
    setErr("");
    setAdding(true);
  }

  async function handleToggleEnabled(d: CustomAttributeDefinition) {
    await fetch(`/api/admin/custom-attributes/${d.attrDefId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !d.isEnabled }),
    });
    await load();
  }

  function openMapping(d: CustomAttributeDefinition) {
    const draft: MappingDraft = {};
    for (const st of SOURCE_TYPES) {
      const m = d.sourceMappings?.find((x) => x.sourceTypeCode === st.code);
      draft[st.code] = { methodCode: m?.methodCode ?? (st.code === "MSSQL" ? "EXTENDED_PROPERTY" : "COMMENT_KEY"), sourceKey: m?.sourceKey ?? "" };
    }
    setMapErr("");
    setMapping({ def: d, draft });
  }

  async function saveMapping() {
    if (!mapping) return;
    setSaving(true); setMapErr("");
    try {
      const r = await fetch(`/api/admin/custom-attributes/${mapping.def.attrDefId}/source-mappings`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: Object.entries(mapping.draft).map(([sourceTypeCode, m]) => ({ sourceTypeCode, ...m })) }),
      });
      if (!r.ok) { setMapErr((await r.json().catch(() => ({}))).error ?? "Failed to save"); return; }
      setMapping(null);
      await load();
    } finally { setSaving(false); }
  }

  const mappable = MAPPABLE.includes(activeType);
  const cols = mappable ? "grid-cols-[100px_1fr_100px_70px_1.2fr_150px]" : "grid-cols-[100px_1fr_110px_70px_120px]";

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
            onClick={() => { setActiveType(t); setAdding(false); setEditingId(null); }}
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
        <button onClick={() => { setAdding(true); setEditingId(null); setForm({ ...BLANK }); setErr(""); }} className="btn btn-primary btn-sm">+ Add Field</button>
      </div>

      {adding && (
        <div className="bg-white border border-brand-purple rounded-xl p-5 mb-4 space-y-4">
          <h3 className="text-sm font-semibold text-ink">{editingId != null ? `Edit Field on ${ASSET_TYPE_LABELS[activeType]}` : `New Field on ${ASSET_TYPE_LABELS[activeType]}`}</h3>
          {editingId != null && (
            <p className="text-[11px] text-muted -mt-2">Code and type can’t change after a field is created — saved values are stored under them.</p>
          )}
          {err && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-md">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Code *</label>
              <input className="input w-full font-mono disabled:bg-canvas-soft disabled:text-muted" placeholder="OWNER_TEAM" value={form.attrCode} disabled={editingId != null}
                onChange={(e) => setForm((f) => ({ ...f, attrCode: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Type *</label>
              <select className="input w-full disabled:bg-canvas-soft disabled:text-muted" value={form.dataType} disabled={editingId != null}
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
            <button onClick={handleAdd} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : editingId != null ? "Save" : "Add"}</button>
            <button onClick={() => { setAdding(false); setEditingId(null); }} className="btn btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {mapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setMapping(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-line max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-line">
              <h3 className="text-[16px] font-bold text-brand-deep">Fill “{mapping.def.attrName}” from the source</h3>
              <p className="text-[12px] text-muted mt-1">
                On every crawl, the value is read from the source and replaces the one in Bayanis. When a later crawl
                finds a different value, the change goes into the table’s metadata-update review. Leave a key empty to not map that source.
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              {SOURCE_TYPES.map((st) => {
                const m = mapping.draft[st.code];
                const set = (patch: Partial<typeof m>) => setMapping({ ...mapping, draft: { ...mapping.draft, [st.code]: { ...m, ...patch } } });
                return (
                  <div key={st.code} className="grid grid-cols-[1.3fr_1fr_1fr] gap-3 items-center">
                    <div className="text-sm font-medium text-ink">{st.label}</div>
                    {st.code === "MSSQL" ? (
                      <select className="input w-full text-sm" value={m.methodCode} onChange={(e) => set({ methodCode: e.target.value as typeof m.methodCode })}>
                        <option value="EXTENDED_PROPERTY">Extended property</option>
                        <option value="COMMENT_KEY">Key in MS_Description</option>
                      </select>
                    ) : (
                      <div className="text-[12px] text-ink-soft">Key in the comment</div>
                    )}
                    <input
                      className="input w-full font-mono text-sm"
                      placeholder={m.methodCode === "EXTENDED_PROPERTY" ? "e.g. DataOwner" : "e.g. owner"}
                      value={m.sourceKey}
                      onChange={(e) => set({ sourceKey: e.target.value })}
                    />
                  </div>
                );
              })}
              <div className="rounded-lg bg-canvas-soft border border-line-soft px-4 py-3 text-[12px] text-ink-soft space-y-1.5">
                <div className="font-semibold text-ink">How to tag values at the source</div>
                <div><span className="font-semibold">SQL Server</span> (extended property):</div>
                <pre className="font-mono text-[11px] whitespace-pre-wrap">{`EXEC sp_addextendedproperty @name = N'DataOwner', @value = N'Finance',
  @level0type = 'SCHEMA', @level0name = N'crm', @level1type = 'TABLE', @level1name = N'customer',
  @level2type = 'COLUMN', @level2name = N'email';`}</pre>
                <div><span className="font-semibold">PostgreSQL / Oracle</span> (key in the comment — <span className="font-mono">key: value</span> pairs separated by <span className="font-mono">;</span>, or a JSON object):</div>
                <pre className="font-mono text-[11px] whitespace-pre-wrap">{`COMMENT ON COLUMN crm.customer.email IS 'Customer email address; owner: Finance; retention: 7y';
COMMENT ON COLUMN crm.customer.email IS 'Customer email address {"owner": "Finance"}';`}</pre>
                <div><span className="font-semibold">MySQL</span>: the same format in the column’s <span className="font-mono">COMMENT</span>.</div>
                <div className="text-muted">Values are checked against the field type (Yes/No accepts yes/no/true/false/1/0; dropdowns must match an option). Invalid values are skipped and listed in the crawl log.</div>
              </div>
              {mapErr && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-md">{mapErr}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-line">
              <button onClick={() => setMapping(null)} className="btn btn-sm">Cancel</button>
              <button onClick={saveMapping} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save mapping"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className={`grid ${cols} gap-3 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold`}>
          <div className="min-w-0 truncate">Code</div><div className="min-w-0 truncate">Label</div><div className="min-w-0 truncate">Type</div><div className="min-w-0 truncate">Required</div>
          {mappable && <div className="min-w-0 truncate">Filled from source</div>}
          <div className="min-w-0 truncate">Actions</div>
        </div>
        {loading && <div className="py-8 text-center text-muted text-sm">Loading…</div>}
        {!loading && inType.map((d) => (
          <div key={d.attrDefId} className={`grid ${cols} gap-3 px-5 py-3 items-center border-b border-line-soft last:border-b-0 hover:bg-canvas-soft ${!d.isEnabled ? "opacity-50" : ""}`}>
            <div className="min-w-0 font-mono text-[11px] text-brand-deep font-semibold truncate">{d.attrCode}</div>
            <div className="min-w-0 text-sm text-ink font-medium truncate">{d.attrName}</div>
            <div className="min-w-0 text-xs text-muted truncate">{DATA_TYPE_LABELS[d.dataType]}</div>
            <div className="min-w-0 text-center text-sm">{d.isRequired ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-400">✗</span>}</div>
            {mappable && (
              <div className="min-w-0 text-[11px] text-ink-soft space-y-0.5">
                {(d.sourceMappings ?? []).length === 0 && <span className="text-muted italic">Not mapped</span>}
                {(d.sourceMappings ?? []).map((m) => (
                  <div key={m.sourceTypeCode} className="truncate" title={`${SOURCE_SHORT[m.sourceTypeCode]}: ${m.methodCode === "EXTENDED_PROPERTY" ? "extended property" : "comment key"} ${m.sourceKey}`}>
                    <span className="font-semibold">{SOURCE_SHORT[m.sourceTypeCode]}</span>
                    {" · "}{m.methodCode === "EXTENDED_PROPERTY" ? "property" : "comment key"} <span className="font-mono">{m.sourceKey}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="min-w-0 flex items-center gap-1.5">
              <ActionIcon title="Edit field" onClick={() => startEdit(d)}>
                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </ActionIcon>
              {mappable && (
                <ActionIcon title="Fill from source system" onClick={() => openMapping(d)}>
                  <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                </ActionIcon>
              )}
              <ActionIcon title={d.isEnabled ? "Disable field" : "Enable field"} onClick={() => handleToggleEnabled(d)}>
                {d.isEnabled
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M1 1l22 22" /></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
              </ActionIcon>
              <ActionIcon title="Delete field" danger onClick={() => handleDelete(d)}>
                <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </ActionIcon>
            </div>
          </div>
        ))}
        {!loading && inType.length === 0 && (
          <div className="py-10 text-center text-muted text-sm">No custom fields defined for {ASSET_TYPE_LABELS[activeType].toLowerCase()} yet.</div>
        )}
      </div>

      <BuiltinFieldMappings />
    </div>
  );
}
