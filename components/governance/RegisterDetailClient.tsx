"use client";

import { useState, useCallback, useEffect } from "react";
import type { GovRegister, RegisterColumn, RegisterEntry, RegisterEntryHistory, RegisterColumnLog } from "@/lib/queries/gov-registers";
import { useLang } from "@/lib/lang-context";

type Props = {
  register:       GovRegister;
  initialColumns: RegisterColumn[];
  initialEntries: RegisterEntry[];
  isAdmin:        boolean;
};

const DATA_TYPES = ["TEXT","NUMBER","DATE","SELECT","BOOLEAN","URL","EMAIL"];

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

export function RegisterDetailClient({ register, initialColumns, initialEntries, isAdmin }: Props) {
  const { t } = useLang();
  const r = t.registers;
  const c = t.common;

  const ACTION_LABEL: Record<string, string> = {
    CREATE: r.actionCreated,
    UPDATE: r.actionUpdated,
    DELETE: r.actionDeleted,
  };
  const ACTION_COLOR: Record<string, string> = {
    CREATE: "bg-emerald-50 text-emerald-700",
    UPDATE: "bg-blue-50 text-blue-700",
    DELETE: "bg-red-50 text-red-700",
  };

  const [columns, setColumns]         = useState<RegisterColumn[]>(initialColumns);
  const [entries, setEntries]         = useState<RegisterEntry[]>(initialEntries);
  const [activeTab, setActiveTab]     = useState<"entries" | "columns" | "history" | "collog">("entries");
  const [history, setHistory]         = useState<RegisterEntryHistory[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [colLog, setColLog]           = useState<RegisterColumnLog[] | null>(null);
  const [colLogLoading, setColLogLoading] = useState(false);

  const [entryModal, setEntryModal]   = useState(false);
  const [editEntry, setEditEntry]     = useState<RegisterEntry | null>(null);
  const [entryData, setEntryData]     = useState<Record<string, string>>({});
  const [savingEntry, setSavingEntry] = useState(false);

  const [colModal, setColModal]       = useState(false);
  const [editCol, setEditCol]         = useState<RegisterColumn | null>(null);
  const [colForm, setColForm]         = useState({ columnName: "", dataType: "TEXT", isRequired: false, optionsRaw: "" });
  const [savingCol, setSavingCol]     = useState(false);

  // Column delete confirmation modal
  const [deleteColTarget, setDeleteColTarget] = useState<RegisterColumn | null>(null);
  const [archiveColData,  setArchiveColData]  = useState(false);
  const [deletingCol,     setDeletingCol]     = useState(false);

  const refreshColumns = useCallback(async () => {
    const res = await fetch(`/api/governance/registers/${register.registerId}/columns`);
    setColumns(await res.json());
  }, [register.registerId]);

  const refreshEntries = useCallback(async () => {
    const res = await fetch(`/api/governance/registers/${register.registerId}/entries`);
    setEntries(await res.json());
  }, [register.registerId]);

  const refreshHistory = useCallback(async () => {
    setHistLoading(true);
    const res = await fetch(`/api/governance/registers/${register.registerId}/history`);
    setHistory(await res.json());
    setHistLoading(false);
  }, [register.registerId]);

  const refreshColLog = useCallback(async () => {
    setColLogLoading(true);
    const res = await fetch(`/api/governance/registers/${register.registerId}/column-log`);
    setColLog(await res.json());
    setColLogLoading(false);
  }, [register.registerId]);

  useEffect(() => {
    if (activeTab === "history" && history === null) refreshHistory();
  }, [activeTab, history, refreshHistory]);

  useEffect(() => {
    if (activeTab === "collog" && colLog === null) refreshColLog();
  }, [activeTab, colLog, refreshColLog]);

  function openNewEntry() { setEditEntry(null); setEntryData({}); setEntryModal(true); }
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
      const col = columns.find((col) => col.columnKey === k);
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
    setHistory(null);
    setEntryModal(false);
    setSavingEntry(false);
  }
  async function deleteEntry(id: number) {
    if (!confirm(r.deleteEntryConfirm)) return;
    await fetch(`/api/governance/registers/${register.registerId}/entries/${id}`, { method: "DELETE" });
    setEntries((p) => p.filter((e) => e.entryId !== id));
    setHistory(null);
  }

  function openNewCol() { setEditCol(null); setColForm({ columnName: "", dataType: "TEXT", isRequired: false, optionsRaw: "" }); setColModal(true); }
  function openEditCol(col: RegisterColumn) {
    setEditCol(col);
    setColForm({ columnName: col.columnName, dataType: col.dataType, isRequired: col.isRequired, optionsRaw: col.options?.join(", ") ?? "" });
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

  async function confirmDeleteCol() {
    if (!deleteColTarget) return;
    setDeletingCol(true);
    await fetch(`/api/governance/registers/${register.registerId}/columns/${deleteColTarget.columnId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveData: archiveColData }),
    });
    setColumns((p) => p.filter((col) => col.columnId !== deleteColTarget.columnId));
    if (archiveColData) setColLog(null);
    setDeleteColTarget(null);
    setArchiveColData(false);
    setDeletingCol(false);
  }

  // Count entries that have a value for a given column key
  function countAffectedEntries(col: RegisterColumn) {
    return entries.filter((e) => e.data[col.columnKey] != null && e.data[col.columnKey] !== "").length;
  }

  const visibleCols = columns.slice(0, 6);

  const tabs = [
    { key: "entries",  label: `${r.tabEntries} (${entries.length})` },
    { key: "columns",  label: `${r.tabColumns} (${columns.length})` },
    { key: "history",  label: r.history },
    ...(isAdmin ? [{ key: "collog", label: "Column Log" }] : []),
  ] as const;

  // Archived register banner
  const isArchived = !!register.deletedAt;

  return (
    <div>
      {isArchived && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <span className="text-amber-500 text-lg">⚠</span>
          <span>
            This register is <strong>archived</strong> and not visible to regular users.
            {register.deletedBy && <> Archived by <strong>{register.deletedBy}</strong>{register.deletedAt && <> on {fmtDate(register.deletedAt)}</>}.</>}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{register.name}</h1>
          {register.description && <p className="text-sm text-ink-soft mt-0.5">{register.description}</p>}
        </div>
        {activeTab === "entries" && !isArchived && (
          <button onClick={openNewEntry} className="btn btn-primary">+ {r.addEntry}</button>
        )}
        {activeTab === "columns" && isAdmin && !isArchived && (
          <button onClick={openNewCol} className="btn btn-primary">+ {r.addColumn}</button>
        )}
        {activeTab === "history" && history !== null && history.length > 0 && (
          <button onClick={refreshHistory} className="btn btn-sm">{r.refresh}</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line mb-5">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-3 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              activeTab === tab.key ? "text-brand-purple border-brand-purple" : "text-ink-soft border-transparent hover:text-brand-purple"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Entries tab */}
      {activeTab === "entries" && (
        <div className="card overflow-hidden">
          {entries.length === 0 ? (
            <div className="py-14 text-center">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm text-ink-soft">{r.noEntriesYet}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr className="bg-canvas-soft border-b border-line text-left">
                    {visibleCols.map((col) => (
                      <th key={col.columnId} className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide whitespace-nowrap">
                        {col.columnName}{col.isRequired && <span className="text-red-400 ml-0.5">*</span>}
                      </th>
                    ))}
                    {columns.length > 6 && (
                      <th className="px-4 py-2.5 text-xs text-muted">
                        {r.moreColumns.replace("{n}", String(columns.length - 6))}
                      </th>
                    )}
                    <th className="px-4 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.entryId} className="border-b border-line-soft hover:bg-canvas transition-colors">
                      {visibleCols.map((col) => (
                        <td key={col.columnId} className="px-4 py-2.5 max-w-[180px] truncate text-ink">
                          <CellValue col={col} value={entry.data[col.columnKey]} yesLabel={c.yes} noLabel={c.no} />
                        </td>
                      ))}
                      {columns.length > 6 && <td className="px-4 py-2.5 text-muted text-xs">…</td>}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEditEntry(entry)} className="text-[11px] text-ink-soft hover:text-brand-purple">{c.edit}</button>
                          <button onClick={() => deleteEntry(entry.entryId)} className="text-[11px] text-ink-soft hover:text-red-500">{c.delete}</button>
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
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">{r.columnName}</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">{r.colKey}</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">{r.columnType}</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">{r.columnRequired}</th>
                <th className="px-4 py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide">{t.governance.fw.colOptions}</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => (
                <tr key={col.columnId} className="border-b border-line-soft hover:bg-canvas">
                  <td className="px-4 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{col.columnName}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{col.columnKey}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-brand-purple/10 text-brand-purple rounded">{col.dataType}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">{col.isRequired ? "✓" : "—"}</td>
                  <td className="px-4 py-2.5 text-muted text-[11px] max-w-[200px] truncate">{col.options?.join(", ") ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {isAdmin && (
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEditCol(col)} className="text-[11px] text-ink-soft hover:text-brand-purple">{c.edit}</button>
                        <button
                          onClick={() => { setDeleteColTarget(col); setArchiveColData(false); }}
                          className="text-[11px] text-ink-soft hover:text-red-500"
                        >
                          {c.delete}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="card overflow-hidden">
          {histLoading && <div className="py-10 text-center text-sm text-muted">{r.loadingHistory}</div>}
          {!histLoading && history !== null && history.length === 0 && (
            <div className="py-14 text-center">
              <div className="text-3xl mb-2">📜</div>
              <p className="text-sm text-ink-soft">{r.noHistoryYet}</p>
            </div>
          )}
          {!histLoading && history !== null && history.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas-soft border-b border-line text-left">
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">{r.histDate}</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">{r.histAction}</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">{r.histEntry}</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">{r.histChangedBy}</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">{r.histSummary}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const data = h.action === "DELETE" ? h.oldData : h.newData;
                  const firstVal = data ? Object.values(data).find((v) => v != null && v !== "") : null;
                  const summary = firstVal != null ? String(firstVal).slice(0, 60) : "—";
                  return (
                    <tr key={h.historyId} className="border-b border-line-soft hover:bg-canvas/30">
                      <td className="px-4 py-2.5 text-muted whitespace-nowrap text-[12px]">{fmtDate(h.changedAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACTION_COLOR[h.action] ?? "bg-gray-50 text-gray-600"}`}>
                          {ACTION_LABEL[h.action] ?? h.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted">#{h.entryId}</td>
                      <td className="px-4 py-2.5 text-[12px] text-ink">{h.changedBy ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[12px] text-ink-soft max-w-[300px] truncate" title={summary}>{summary}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Column Log tab (admin only) */}
      {activeTab === "collog" && isAdmin && (
        <div className="card overflow-hidden">
          {colLogLoading && <div className="py-10 text-center text-sm text-muted">Loading column log…</div>}
          {!colLogLoading && colLog !== null && colLog.length === 0 && (
            <div className="py-14 text-center">
              <div className="text-3xl mb-2">🗂</div>
              <p className="text-sm text-ink-soft">No column changes archived yet.</p>
            </div>
          )}
          {!colLogLoading && colLog !== null && colLog.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas-soft border-b border-line text-left">
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-36">Date</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-20">Action</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Column</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold w-24">Affected</th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-muted font-semibold">Archived By</th>
                </tr>
              </thead>
              <tbody>
                {colLog.map((log) => (
                  <tr key={log.logId} className="border-b border-line-soft hover:bg-canvas/30">
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap text-[12px]">{fmtDate(log.changedAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        log.action === "DELETED" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink text-[12px]">{log.columnName}</div>
                      <div className="text-[10px] font-mono text-muted">{log.columnKey}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted">
                      {log.action === "DELETED" ? (
                        <span title={log.archivedData ? "Data archived" : "Data not archived"}>
                          {log.affectedCount} entries
                          {log.archivedData ? " ✓" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-ink">{log.changedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Entry Modal */}
      {entryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEntryModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editEntry ? r.editEntry : r.addEntryModal}</h2>
            <div className="space-y-3">
              {columns.map((col) => (
                <div key={col.columnId}>
                  <label className="block text-[12px] font-semibold text-ink-soft mb-1">
                    {col.columnName}{col.isRequired && <span className="text-red-400 ml-0.5">*</span>}
                    <span className="text-[10px] text-muted ml-1 font-normal">({col.dataType})</span>
                  </label>
                  <EntryField col={col} value={entryData[col.columnKey] ?? ""}
                    onChange={(v) => setEntryData((p) => ({ ...p, [col.columnKey]: v }))}
                    yesLabel={c.yes} noLabel={c.no} selectPlaceholder={r.selectPlaceholder} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEntryModal(false)} className="btn btn-sm">{c.cancel}</button>
              <button onClick={saveEntry} disabled={savingEntry} className="btn btn-primary btn-sm">{savingEntry ? c.saving : c.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Column Modal */}
      {colModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setColModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editCol ? r.editColumnModal : r.addColumnModal}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-ink-soft mb-1">{r.columnName} *</label>
                <input value={colForm.columnName} onChange={(e) => setColForm((p) => ({ ...p, columnName: e.target.value }))} className="field" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-soft mb-1">{r.formDataType}</label>
                <select value={colForm.dataType} onChange={(e) => setColForm((p) => ({ ...p, dataType: e.target.value }))} className="field">
                  {DATA_TYPES.map((tp) => <option key={tp}>{tp}</option>)}
                </select>
              </div>
              {colForm.dataType === "SELECT" && (
                <div>
                  <label className="block text-[12px] font-semibold text-ink-soft mb-1">{r.formOptions}</label>
                  <input value={colForm.optionsRaw} onChange={(e) => setColForm((p) => ({ ...p, optionsRaw: e.target.value }))} className="field" placeholder="Option A, Option B" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="req" checked={colForm.isRequired} onChange={(e) => setColForm((p) => ({ ...p, isRequired: e.target.checked }))} />
                <label htmlFor="req" className="text-sm text-ink">{r.formRequired}</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setColModal(false)} className="btn btn-sm">{c.cancel}</button>
              <button onClick={saveCol} disabled={savingCol || !colForm.columnName.trim()} className="btn btn-primary btn-sm">{savingCol ? c.saving : c.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Column Delete Confirmation Modal */}
      {deleteColTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !deletingCol && setDeleteColTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 text-red-500 text-xl">⚠</div>
              <div>
                <h2 className="text-base font-bold text-ink mb-1">Delete Column</h2>
                <p className="text-sm text-ink-soft">
                  You are about to delete <strong>&ldquo;{deleteColTarget.columnName}&rdquo;</strong>
                  {" "}(<code className="text-[11px] bg-canvas-soft px-1 rounded">{deleteColTarget.columnKey}</code>).
                </p>
              </div>
            </div>

            {(() => {
              const affected = countAffectedEntries(deleteColTarget);
              return (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
                  <p className="font-semibold mb-1">Data impact:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[12px]">
                    <li>
                      {affected > 0
                        ? <><strong>{affected}</strong> of {entries.length} entries have data in this column — it will be permanently removed.</>
                        : "No entries have data in this column."}
                    </li>
                    <li>This column definition will be permanently deleted.</li>
                    <li>This action cannot be undone.</li>
                  </ul>
                </div>
              );
            })()}

            <label className="flex items-start gap-3 cursor-pointer mb-5 p-3 rounded-lg border border-line hover:bg-canvas-soft">
              <input
                type="checkbox"
                checked={archiveColData}
                onChange={(e) => setArchiveColData(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-semibold text-ink">Archive column data to audit log</div>
                <div className="text-[11px] text-muted mt-0.5">
                  Saves a snapshot of all entry values for this column to the Column Log tab before deletion. Recommended for legal or compliance reference.
                </div>
              </div>
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteColTarget(null)} disabled={deletingCol} className="btn btn-sm">{c.cancel}</button>
              <button onClick={confirmDeleteCol} disabled={deletingCol} className="btn btn-sm bg-red-500 text-white border-red-500 hover:bg-red-600">
                {deletingCol ? "Deleting…" : "Delete Column"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CellValue({ col, value, yesLabel, noLabel }: { col: RegisterColumn; value: unknown; yesLabel: string; noLabel: string }) {
  if (value == null || value === "") return <span className="text-muted">—</span>;
  if (col.dataType === "BOOLEAN") return <span>{value ? yesLabel : noLabel}</span>;
  if (col.dataType === "URL") return <a href={String(value)} target="_blank" rel="noreferrer" className="text-brand-purple hover:underline truncate">{String(value)}</a>;
  if (col.dataType === "DATE") return <span>{String(value).slice(0, 10)}</span>;
  return <span>{String(value)}</span>;
}

function EntryField({ col, value, onChange, yesLabel, noLabel, selectPlaceholder }: {
  col: RegisterColumn; value: string; onChange: (v: string) => void;
  yesLabel: string; noLabel: string; selectPlaceholder: string;
}) {
  if (col.dataType === "SELECT" && col.options) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">{selectPlaceholder}</option>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.dataType === "DATE") return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="field" />;
  if (col.dataType === "BOOLEAN") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">{selectPlaceholder}</option>
        <option value="true">{yesLabel}</option>
        <option value="false">{noLabel}</option>
      </select>
    );
  }
  if (col.dataType === "URL" || col.dataType === "EMAIL") return <input type={col.dataType === "URL" ? "url" : "email"} value={value} onChange={(e) => onChange(e.target.value)} className="field" />;
  if (col.dataType === "NUMBER") return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="field" />;
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="field" />;
}
