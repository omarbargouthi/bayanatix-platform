"use client";

import { useState, useCallback } from "react";
import type { GovRegister, RegisterColumn, RegisterEntry } from "@/lib/queries/gov-registers";

type Props = {
  register:       GovRegister;
  initialColumns: RegisterColumn[];
  initialEntries: RegisterEntry[];
  isAdmin:        boolean;
};

const DATA_TYPES = ["TEXT","NUMBER","DATE","SELECT","BOOLEAN","URL","EMAIL"];

export function RegisterDetailClient({ register, initialColumns, initialEntries, isAdmin }: Props) {
  const [columns, setColumns]       = useState<RegisterColumn[]>(initialColumns);
  const [entries, setEntries]       = useState<RegisterEntry[]>(initialEntries);
  const [activeTab, setActiveTab]   = useState<"entries" | "columns">("entries");

  // Entry state
  const [entryModal, setEntryModal] = useState(false);
  const [editEntry, setEditEntry]   = useState<RegisterEntry | null>(null);
  const [entryData, setEntryData]   = useState<Record<string, string>>({});
  const [savingEntry, setSavingEntry] = useState(false);

  // Column state
  const [colModal, setColModal]     = useState(false);
  const [editCol, setEditCol]       = useState<RegisterColumn | null>(null);
  const [colForm, setColForm]       = useState({ columnName: "", dataType: "TEXT", isRequired: false, optionsRaw: "" });
  const [savingCol, setSavingCol]   = useState(false);

  const refreshColumns = useCallback(async () => {
    const r = await fetch(`/api/governance/registers/${register.registerId}/columns`);
    setColumns(await r.json());
  }, [register.registerId]);

  const refreshEntries = useCallback(async () => {
    const r = await fetch(`/api/governance/registers/${register.registerId}/entries`);
    setEntries(await r.json());
  }, [register.registerId]);

  // ── Entry CRUD ──
  function openNewEntry() {
    setEditEntry(null);
    setEntryData({});
    setEntryModal(true);
  }
  function openEditEntry(e: RegisterEntry) {
    setEditEntry(e);
    const d: Record<string, string> = {};
    for (const col of columns) d[col.columnKey] = String(e.data[col.columnKey] ?? "");
    setEntryData(d);
    setEntryModal(true);
  }
  async function saveEntry() {
    setSavingEntry(true);
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entryData)) {
      const col = columns.find((c) => c.columnKey === k);
      if (col?.dataType === "NUMBER") data[k] = v === "" ? null : Number(v);
      else if (col?.dataType === "BOOLEAN") data[k] = v === "true";
      else data[k] = v || null;
    }
    if (editEntry) {
      await fetch(`/api/governance/registers/${register.registerId}/entries/${editEntry.entryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
      });
    } else {
      await fetch(`/api/governance/registers/${register.registerId}/entries`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
      });
    }
    await refreshEntries();
    setEntryModal(false);
    setSavingEntry(false);
  }
  async function deleteEntry(id: number) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/governance/registers/${register.registerId}/entries/${id}`, { method: "DELETE" });
    setEntries((p) => p.filter((e) => e.entryId !== id));
  }

  // ── Column CRUD ──
  function openNewCol() {
    setEditCol(null);
    setColForm({ columnName: "", dataType: "TEXT", isRequired: false, optionsRaw: "" });
    setColModal(true);
  }
  function openEditCol(c: RegisterColumn) {
    setEditCol(c);
    setColForm({ columnName: c.columnName, dataType: c.dataType, isRequired: c.isRequired, optionsRaw: c.options?.join(", ") ?? "" });
    setColModal(true);
  }
  function slugify(s: string) { return s.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""); }
  async function saveCol() {
    setSavingCol(true);
    const opts = colForm.dataType === "SELECT" ? colForm.optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;
    const body = { columnName: colForm.columnName, dataType: colForm.dataType, isRequired: colForm.isRequired, options: opts, sortOrder: editCol?.sortOrder ?? columns.length };
    if (editCol) {
      await fetch(`/api/governance/registers/${register.registerId}/columns/${editCol.columnId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    } else {
      await fetch(`/api/governance/registers/${register.registerId}/columns`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, columnKey: slugify(colForm.columnName) }),
      });
    }
    await refreshColumns();
    setColModal(false);
    setSavingCol(false);
  }
  async function deleteCol(id: number) {
    if (!confirm("Delete this column? Existing entry data for this column will remain in the database but won't be displayed.")) return;
    await fetch(`/api/governance/registers/${register.registerId}/columns/${id}`, { method: "DELETE" });
    setColumns((p) => p.filter((c) => c.columnId !== id));
  }

  const visibleCols = columns.slice(0, 6);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{register.name}</h1>
          {register.description && <p className="text-sm text-ink-soft mt-0.5">{register.description}</p>}
        </div>
        {activeTab === "entries" && (
          <button onClick={openNewEntry} className="btn btn-primary">+ Add Entry</button>
        )}
        {activeTab === "columns" && (
          <button onClick={openNewCol} className="btn btn-primary">+ Add Column</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line mb-5">
        {(["entries", "columns"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-semibold transition-colors -mb-px border-b-2 capitalize ${
              activeTab === tab ? "text-brand-purple border-brand-purple" : "text-ink-soft border-transparent hover:text-brand-purple"
            }`}>
            {tab === "entries" ? `Entries (${entries.length})` : `Configure Columns (${columns.length})`}
          </button>
        ))}
      </div>

      {/* Entries tab */}
      {activeTab === "entries" && (
        <div className="card overflow-hidden">
          {entries.length === 0 ? (
            <div className="py-14 text-center">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm text-ink-soft">No entries yet. Click <strong>Add Entry</strong> to add the first record.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="bg-canvas-soft border-b border-line text-left">
                    {visibleCols.map((c) => (
                      <th key={c.columnId} className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide whitespace-nowrap">
                        {c.columnName}{c.isRequired && <span className="text-red-400 ml-0.5">*</span>}
                      </th>
                    ))}
                    {columns.length > 6 && <th className="px-4 py-2.5 text-xs text-muted">+{columns.length - 6} more</th>}
                    <th className="px-4 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.entryId} className="border-b border-line-soft hover:bg-canvas transition-colors">
                      {visibleCols.map((c) => (
                        <td key={c.columnId} className="px-4 py-2.5 max-w-[180px] truncate text-ink">
                          <CellValue col={c} value={entry.data[c.columnKey]} />
                        </td>
                      ))}
                      {columns.length > 6 && <td className="px-4 py-2.5 text-muted text-xs">…</td>}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEditEntry(entry)} className="text-[11px] text-ink-soft hover:text-brand-purple">Edit</button>
                          <button onClick={() => deleteEntry(entry.entryId)} className="text-[11px] text-ink-soft hover:text-red-500">Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Columns tab */}
      {activeTab === "columns" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas-soft border-b border-line text-left">
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">Column Name</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">Key</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">Required</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">Options</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={c.columnId} className="border-b border-line-soft hover:bg-canvas">
                  <td className="px-4 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{c.columnName}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{c.columnKey}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-brand-purple/10 text-brand-purple rounded">{c.dataType}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">{c.isRequired ? "✓" : "—"}</td>
                  <td className="px-4 py-2.5 text-muted text-[11px] max-w-[200px] truncate">
                    {c.options?.join(", ") ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEditCol(c)} className="text-[11px] text-ink-soft hover:text-brand-purple">Edit</button>
                      <button onClick={() => deleteCol(c.columnId)} className="text-[11px] text-ink-soft hover:text-red-500">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Entry Modal */}
      {entryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEntryModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editEntry ? "Edit Entry" : "Add Entry"}</h2>
            <div className="space-y-3">
              {columns.map((col) => (
                <div key={col.columnId}>
                  <label className="block text-[12px] font-semibold text-ink-soft mb-1">
                    {col.columnName}{col.isRequired && <span className="text-red-400 ml-0.5">*</span>}
                    <span className="text-[10px] text-muted ml-1 font-normal">({col.dataType})</span>
                  </label>
                  <EntryField col={col} value={entryData[col.columnKey] ?? ""} onChange={(v) => setEntryData((p) => ({ ...p, [col.columnKey]: v }))} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEntryModal(false)} className="btn btn-sm">Cancel</button>
              <button onClick={saveEntry} disabled={savingEntry} className="btn btn-primary btn-sm">{savingEntry ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Column Modal */}
      {colModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setColModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editCol ? "Edit Column" : "Add Column"}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-ink-soft mb-1">Column Name *</label>
                <input value={colForm.columnName} onChange={(e) => setColForm((p) => ({ ...p, columnName: e.target.value }))} className="field" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-soft mb-1">Data Type</label>
                <select value={colForm.dataType} onChange={(e) => setColForm((p) => ({ ...p, dataType: e.target.value }))} className="field">
                  {DATA_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              {colForm.dataType === "SELECT" && (
                <div>
                  <label className="block text-[12px] font-semibold text-ink-soft mb-1">Options (comma-separated)</label>
                  <input value={colForm.optionsRaw} onChange={(e) => setColForm((p) => ({ ...p, optionsRaw: e.target.value }))} className="field" placeholder="Option A, Option B, Option C" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="req" checked={colForm.isRequired} onChange={(e) => setColForm((p) => ({ ...p, isRequired: e.target.checked }))} />
                <label htmlFor="req" className="text-sm text-ink">Required field</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setColModal(false)} className="btn btn-sm">Cancel</button>
              <button onClick={saveCol} disabled={savingCol || !colForm.columnName.trim()} className="btn btn-primary btn-sm">{savingCol ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CellValue({ col, value }: { col: RegisterColumn; value: unknown }) {
  if (value == null || value === "") return <span className="text-muted">—</span>;
  if (col.dataType === "BOOLEAN") return <span>{value ? "Yes" : "No"}</span>;
  if (col.dataType === "URL") return <a href={String(value)} target="_blank" rel="noreferrer" className="text-brand-purple hover:underline truncate">{String(value)}</a>;
  if (col.dataType === "DATE") return <span>{String(value).slice(0, 10)}</span>;
  return <span>{String(value)}</span>;
}

function EntryField({ col, value, onChange }: { col: RegisterColumn; value: string; onChange: (v: string) => void }) {
  if (col.dataType === "SELECT" && col.options) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">— Select —</option>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.dataType === "DATE") return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="field" />;
  if (col.dataType === "BOOLEAN") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">— Select —</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (col.dataType === "URL" || col.dataType === "EMAIL") return <input type={col.dataType === "URL" ? "url" : "email"} value={value} onChange={(e) => onChange(e.target.value)} className="field" />;
  if (col.dataType === "NUMBER") return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="field" />;
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="field" />;
}
