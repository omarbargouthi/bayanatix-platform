"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";

export type ManualProcess = {
  processId: number; name: string; description: string | null;
  linkCount: number; pendingCount: number; createdBy: string | null; createdAt: string | null;
};

export async function fetchProcesses(): Promise<ManualProcess[]> {
  const r = await fetch("/api/lineage/processes");
  return r.ok ? r.json() : [];
}

const NEW = "__new__";

// Pick the named manual process a link belongs to, or create one inline.
export function ProcessPicker({ value, onChange, canCreate = true }: {
  value: number | null; onChange: (processId: number | null) => void; canCreate?: boolean;
}) {
  const { t } = useLang();
  const lp = t.lineageProcesses;
  const [list, setList] = useState<ManualProcess[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchProcesses().then(setList).catch(() => {}); }, []);

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/lineage/processes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: desc }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? lp.createFailed); return; }
      setList(await fetchProcesses());
      onChange(d.processId);
      setCreating(false); setName(""); setDesc("");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <label className="field-label">{lp.process}</label>
      <select
        className="input-field w-full"
        value={creating ? NEW : value ?? ""}
        onChange={(e) => {
          if (e.target.value === NEW) { setCreating(true); return; }
          setCreating(false);
          onChange(e.target.value === "" ? null : Number(e.target.value));
        }}
      >
        <option value="">{lp.noProcess}</option>
        {list.map((p) => <option key={p.processId} value={p.processId}>{p.name}</option>)}
        {canCreate && <option value={NEW}>{lp.newProcess}</option>}
      </select>
      {!creating && <p className="text-[11px] text-muted mt-1">{lp.processHint}</p>}
      {creating && (
        <div className="mt-2 border border-line rounded-lg p-3 space-y-2 bg-canvas-soft/50">
          <input className="input-field w-full" placeholder={lp.newNamePh} value={name} onChange={(e) => setName(e.target.value)} aria-label={lp.newName} dir="auto" autoFocus />
          <input className="input-field w-full" placeholder={lp.newDesc} value={desc} onChange={(e) => setDesc(e.target.value)} dir="auto" />
          {error && <div className="text-[12px] text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setCreating(false); setError(null); }} className="btn btn-sm">{t.common.cancel}</button>
            <button type="button" onClick={create} disabled={busy || !name.trim()} className="btn btn-primary btn-sm">{busy ? lp.creating : lp.create}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// "Processes" dialog: list, rename/describe, delete unused ones, jump to their links.
export function ProcessManager({ canManage, onClose, onShowLinks }: {
  canManage: boolean; onClose: () => void; onShowLinks: (p: ManualProcess) => void;
}) {
  const { t } = useLang();
  const lp = t.lineageProcesses;
  const [list, setList] = useState<ManualProcess[] | null>(null);
  const [edit, setEdit] = useState<{ id: number; name: string; desc: string } | null>(null);
  const [adding, setAdding] = useState<{ name: string; desc: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetchProcesses().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  async function call(url: string, method: string, body?: object) {
    setError(null);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? lp.createFailed); return false; }
    await load();
    return true;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border border-line max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-[16px] font-bold text-brand-deep">{lp.manageTitle}</h2>
            <p className="text-[12px] text-muted mt-0.5">{lp.manageDesc}</p>
          </div>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 overflow-y-auto space-y-3">
          {error && <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {canManage && !adding && <button onClick={() => setAdding({ name: "", desc: "" })} className="btn btn-sm">{lp.newProcess}</button>}
          {adding && (
            <div className="border border-line rounded-lg p-3 space-y-2 bg-canvas-soft/50">
              <input className="input-field w-full" placeholder={lp.newNamePh} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} dir="auto" autoFocus />
              <input className="input-field w-full" placeholder={lp.newDesc} value={adding.desc} onChange={(e) => setAdding({ ...adding, desc: e.target.value })} dir="auto" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(null)} className="btn btn-sm">{t.common.cancel}</button>
                <button disabled={!adding.name.trim()} onClick={async () => { if (await call("/api/lineage/processes", "POST", { name: adding.name, description: adding.desc })) setAdding(null); }} className="btn btn-primary btn-sm">{lp.create}</button>
              </div>
            </div>
          )}
          {list == null && <div className="text-sm text-muted py-6 text-center">{t.lineageTools.loading}</div>}
          {list?.length === 0 && <div className="text-[13px] text-muted py-6 text-center">{lp.empty}</div>}
          {list && list.length > 0 && (
            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-canvas-soft">
                  <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                    <th className="px-3 py-2 text-start">{lp.colName}</th>
                    <th className="px-3 py-2 text-start">{lp.colLinks}</th>
                    <th className="px-3 py-2 text-start">{lp.colCreated}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.processId} className="border-t border-line-soft align-top">
                      <td className="px-3 py-2">
                        {edit?.id === p.processId ? (
                          <div className="space-y-1.5">
                            <input className="input-field w-full" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} dir="auto" />
                            <input className="input-field w-full" placeholder={lp.newDesc} value={edit.desc} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} dir="auto" />
                          </div>
                        ) : (
                          <>
                            <div className="text-[13px] font-semibold text-ink" dir="auto">{p.name}</div>
                            {p.description && <div className="text-[11px] text-muted" dir="auto">{p.description}</div>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-ink-soft whitespace-nowrap">
                        {p.linkCount}{p.pendingCount > 0 && <div className="text-[11px] text-amber-700">{lp.pendingN.replace("{n}", String(p.pendingCount))}</div>}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted whitespace-nowrap">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        {p.createdBy && <div>{p.createdBy}</div>}
                      </td>
                      <td className="px-3 py-2 text-end whitespace-nowrap text-[12px] font-medium space-x-3">
                        {edit?.id === p.processId ? (
                          <>
                            <button onClick={() => setEdit(null)} className="text-ink-soft hover:underline">{t.common.cancel}</button>
                            <button onClick={async () => { if (await call(`/api/lineage/processes/${p.processId}`, "PATCH", { name: edit.name, description: edit.desc })) setEdit(null); }} className="text-brand-purple hover:underline">{lp.save}</button>
                          </>
                        ) : (
                          <>
                            {p.linkCount > 0 && <button onClick={() => onShowLinks(p)} className="text-ink-soft hover:text-brand-purple hover:underline">{lp.showLinks}</button>}
                            {canManage && <button onClick={() => setEdit({ id: p.processId, name: p.name, desc: p.description ?? "" })} className="text-brand-purple hover:underline">{lp.edit}</button>}
                            {canManage && (
                              <button
                                onClick={() => call(`/api/lineage/processes/${p.processId}`, "DELETE")}
                                disabled={p.linkCount > 0 || p.pendingCount > 0}
                                title={p.linkCount > 0 || p.pendingCount > 0 ? lp.deleteBlocked : undefined}
                                className="text-red-600 hover:underline disabled:opacity-40 disabled:no-underline"
                              >{lp.delete}</button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
