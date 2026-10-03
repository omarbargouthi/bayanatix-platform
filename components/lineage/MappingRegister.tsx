"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { AddLineageModal } from "./AddLineageModal";
import { LineageImportButton } from "./LineageImportButton";
import { ReviewRequestModal } from "./ReviewRequestModal";

type Row = {
  lineageId: number | null; changeId: number | null; scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";
  sourceSystem: string | null; sourceSchema: string | null; sourceTable: string | null; sourceColumn: string | null; sourceEntityId: number | null;
  targetSystem: string | null; targetSchema: string | null; targetTable: string | null; targetColumn: string | null; targetEntityId: number | null;
  transformationTypeCode: string | null; transformationTypeName: string | null; logic: string | null;
  provenance: "SCANNED" | "MANUAL"; isConfirmed: boolean; processName: string | null;
  pendingOp: "CREATE" | "UPDATE" | "DELETE" | null; pendingRequestId: number | null;
  openReviews: number; updatedAt: string | null; updatedBy: string | null;
};
type History = {
  changeId: number; op: string; status: string; origin: string; requestId: number | null;
  requestedBy: string | null; requestedAt: string; decidedAt: string | null; note: string | null;
  typeCode: string | null; logic: string | null; previous: { transformation_type_code?: string | null; transformation_logic_text?: string | null } | null;
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const label = (r: Row) =>
  `${r.sourceTable ?? "?"}${r.sourceColumn ? `.${r.sourceColumn}` : ""} → ${r.targetTable ?? "?"}${r.targetColumn ? `.${r.targetColumn}` : ""}`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Catalog-wide register of every data mapping (lineage link), scanned and manual,
// plus proposed ones awaiting approval. Manual mappings can be edited/removed
// (through approval, recorded in history); any mapping can get a review request.
export function MappingRegister({ canManage, initialQuery = "" }: { canManage: boolean; initialQuery?: string }) {
  const { t } = useLang();
  const lr = t.lineageRegister;
  const [q, setQ] = useState(initialQuery);
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("");
  const [level, setLevel] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Row[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [editing, setEditing] = useState<{ row: Row; mode: "edit" | "remove"; typeCode: string; logic: string; note: string } | null>(null);
  const [history, setHistory] = useState<{ row: Row; items: History[] | null } | null>(null);
  const [types, setTypes] = useState<{ code: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string; requestId?: number | null } | null>(null);

  const query = useCallback(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (q.trim()) p.set("q", q.trim());
    if (origin) p.set("origin", origin);
    if (status) p.set("status", status);
    if (level) p.set("level", level);
    return p;
  }, [q, origin, status, level, page]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/lineage/register?${query()}`)
        .then((r) => r.json())
        .then(setData)
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, reload]);

  useEffect(() => { setPage(1); }, [q, origin, status, level]);
  useEffect(() => {
    if (canManage) fetch("/api/lineage/transformation-types").then((r) => (r.ok ? r.json() : [])).then(setTypes).catch(() => {});
  }, [canManage]);

  async function openHistory(row: Row) {
    setHistory({ row, items: null });
    const r = await fetch(`/api/lineage/history?lineageId=${row.lineageId}`);
    setHistory({ row, items: r.ok ? await r.json() : [] });
  }

  async function submitEdit() {
    if (!editing?.row.lineageId) return;
    setBusy(true);
    try {
      const id = editing.row.lineageId;
      const r = editing.mode === "edit"
        ? await fetch(`/api/lineage/edges/${id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transformationTypeCode: editing.typeCode, transformationLogicText: editing.logic, note: editing.note }),
          })
        : await fetch(`/api/lineage/edges/${id}?note=${encodeURIComponent(editing.note)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage({ kind: "err", text: d.error ?? lr.actionFailed }); return; }
      setMessage(d.mode === "PENDING"
        ? { kind: "ok", text: fill(lr.submittedPending, { id: d.requestId }), requestId: d.requestId }
        : { kind: "ok", text: lr.submittedApplied });
      setEditing(null);
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  const end = (system: string | null, schema: string | null, table: string | null, column: string | null) => (
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-ink truncate" dir="auto" title={`${table ?? ""}${column ? "." + column : ""}`}>
        {table ?? "—"}{column && <span className="text-brand-purple">.{column}</span>}
      </div>
      <div className="text-[11px] text-muted truncate" dir="auto">{[system, schema].filter(Boolean).join(" · ")}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-brand-deep">{lr.title}</h2>
            <p className="text-[13px] text-muted mt-0.5 max-w-3xl">{lr.desc}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={`/api/lineage/register?${query()}&format=xlsx`} className="btn btn-sm">⭳ {t.lineageTools.exportExcel}</a>
            {canManage && <LineageImportButton onImported={() => setReload((n) => n + 1)} />}
            {canManage && <button onClick={() => setAdding(true)} className="btn btn-primary btn-sm">+ {lr.addMapping}</button>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input className="input-field flex-1 min-w-[240px]" placeholder={lr.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input-field w-auto" value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">{lr.allOrigins}</option>
            <option value="SCANNED">{t.lineageTools.scanned}</option>
            <option value="MANUAL">{t.lineageTools.manualLabel}</option>
          </select>
          <select className="input-field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{lr.allStatuses}</option>
            <option value="ACTIVE">{lr.statusActive}</option>
            <option value="PENDING">{lr.statusPending}</option>
            <option value="REVIEW">{lr.statusReview}</option>
          </select>
          <select className="input-field w-auto" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">{lr.allLevels}</option>
            <option value="ENTITY_LEVEL">{lr.levelTable}</option>
            <option value="ATTRIBUTE_LEVEL">{lr.levelColumn}</option>
          </select>
        </div>
      </div>

      {message && (
        <div className={`text-[13px] rounded-md px-4 py-2.5 border flex items-center justify-between gap-3 ${message.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
          <span>
            {message.text}{" "}
            {message.requestId && <Link href={`/requests/${message.requestId}`} className="font-semibold underline">{fill(lr.requestNo, { id: message.requestId })}</Link>}
          </span>
          <button onClick={() => setMessage(null)} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-soft">
          <span className="text-[13px] text-muted">{data ? fill(lr.resultsCount, { n: data.total.toLocaleString() }) : ""}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-sm">{lr.prev}</button>
              <span className="text-[12px] text-muted">{fill(lr.pageOf, { page, total: totalPages })}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-sm">{lr.next}</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-canvas-soft">
              <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                <th className="px-4 py-2.5 text-start">{lr.colSource}</th>
                <th className="px-1" />
                <th className="px-4 py-2.5 text-start">{lr.colTarget}</th>
                <th className="px-4 py-2.5 text-start">{lr.colTransformation}</th>
                <th className="px-4 py-2.5 text-start">{lr.colOrigin}</th>
                <th className="px-4 py-2.5 text-start">{lr.colStatus}</th>
                <th className="px-4 py-2.5 text-start">{lr.colUpdated}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className={loading ? "opacity-60" : ""}>
              {data?.rows.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-muted">{lr.noResults}</td></tr>
              )}
              {data?.rows.map((r) => {
                const editable = canManage && r.provenance === "MANUAL" && r.lineageId != null && !r.pendingOp;
                return (
                  <tr key={r.lineageId ?? `c${r.changeId}`} className={`border-t border-line-soft align-top ${r.pendingOp ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-2.5 max-w-[240px]">{end(r.sourceSystem, r.sourceSchema, r.sourceTable, r.sourceColumn)}</td>
                    <td className="px-1 py-2.5 text-muted">→</td>
                    <td className="px-4 py-2.5 max-w-[240px]">{end(r.targetSystem, r.targetSchema, r.targetTable, r.targetColumn)}</td>
                    <td className="px-4 py-2.5 max-w-[220px]">
                      <div className="text-[12px] text-ink-soft">{r.transformationTypeName ?? r.transformationTypeCode ?? "—"}</div>
                      {r.logic && <div className="text-[11px] font-mono text-muted truncate" title={r.logic} dir="ltr">{r.logic}</div>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.provenance === "SCANNED" ? "bg-sky-50 text-sky-700" : "bg-purple-50 text-purple-700"}`}>
                        {r.provenance === "SCANNED" ? t.lineageTools.scanned : t.lineageTools.manualLabel}
                      </span>
                      <div className="text-[10px] text-muted mt-1">{r.scope === "ATTRIBUTE_LEVEL" ? lr.levelColumn : lr.levelTable}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      {r.pendingOp ? (
                        <div className="text-amber-700">
                          {r.pendingOp === "CREATE" ? lr.pendingCreate : r.pendingOp === "UPDATE" ? lr.pendingUpdate : lr.pendingDelete}
                          {r.pendingRequestId && <Link href={`/requests/${r.pendingRequestId}`} className="block text-[11px] font-semibold underline">{fill(lr.requestNo, { id: r.pendingRequestId })}</Link>}
                        </div>
                      ) : <span className="text-emerald-700">{lr.statusActive}</span>}
                      {r.openReviews > 0 && <div className="text-[11px] text-sky-700 mt-0.5">{fill(lr.reviewsOpen, { n: r.openReviews })}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-muted whitespace-nowrap">
                      {fmtDate(r.updatedAt)}
                      {r.updatedBy && <div>{fill(lr.byName, { name: r.updatedBy })}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-end w-[190px]">
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[12px] font-medium">
                        {r.lineageId != null && <button onClick={() => openHistory(r)} className="text-ink-soft hover:text-brand-purple hover:underline">{lr.actHistory}</button>}
                        {r.targetEntityId != null && <Link href={`/lineage?assetType=DATA_ENTITIES&assetId=${r.targetEntityId}`} className="text-ink-soft hover:text-brand-purple hover:underline">{lr.actShowGraph}</Link>}
                        {editable && (
                          <>
                            <button onClick={() => setEditing({ row: r, mode: "edit", typeCode: r.transformationTypeCode ?? "MANUAL", logic: r.logic ?? "", note: "" })} className="text-brand-purple hover:underline">{lr.actEdit}</button>
                            <button onClick={() => setEditing({ row: r, mode: "remove", typeCode: "", logic: "", note: "" })} className="text-red-600 hover:underline">{lr.actRemove}</button>
                          </>
                        )}
                        {r.lineageId != null && <button onClick={() => setReviewing(r)} className="text-sky-700 hover:underline">{lr.actReview}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <AddLineageModal
          onClose={() => setAdding(false)}
          onSaved={(res) => {
            setAdding(false);
            setMessage(res?.mode === "PENDING"
              ? { kind: "ok", text: fill(lr.submittedPending, { id: res.requestId ?? "" }), requestId: res.requestId }
              : { kind: "ok", text: lr.submittedApplied });
            setReload((n) => n + 1);
          }}
        />
      )}

      {reviewing?.lineageId != null && (
        <ReviewRequestModal lineageId={reviewing.lineageId} label={label(reviewing)} onClose={() => setReviewing(null)} onDone={() => setReload((n) => n + 1)} />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-line" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-line">
              <h2 className="text-[16px] font-bold text-brand-deep">{editing.mode === "edit" ? lr.editTitle : lr.removeTitle}</h2>
              <p className="text-[12px] text-ink-soft mt-1 truncate" dir="auto">{label(editing.row)}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              {editing.mode === "edit" ? (
                <>
                  <div>
                    <label className="field-label">{lr.colTransformation}</label>
                    <select className="input-field w-full" value={editing.typeCode} onChange={(e) => setEditing({ ...editing, typeCode: e.target.value })}>
                      {types.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t.lineageEditor.logic}</label>
                    <textarea className="input-field w-full font-mono text-[12px]" rows={3} value={editing.logic} onChange={(e) => setEditing({ ...editing, logic: e.target.value })} />
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-ink">{lr.removeConfirm}</p>
              )}
              <div>
                <label className="field-label">{lr.changeNote}</label>
                <textarea className="input-field w-full" rows={2} placeholder={lr.changeNotePh} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} dir="auto" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-line">
              <button onClick={() => setEditing(null)} className="btn btn-sm">{t.common.cancel}</button>
              <button onClick={submitEdit} disabled={busy} className={`btn btn-sm ${editing.mode === "remove" ? "!bg-red-600 !text-white !border-red-600" : "btn-primary"}`}>
                {busy ? lr.submitting : lr.submit}
              </button>
            </div>
          </div>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setHistory(null)}>
          <div className="w-[440px] max-w-full h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bold text-[15px] text-brand-deep">{lr.historyTitle}</h2>
                <p className="text-xs text-ink-soft mt-0.5 truncate" dir="auto">{label(history.row)}</p>
              </div>
              <button onClick={() => setHistory(null)} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto nice-scroll px-5 py-4 space-y-3">
              {history.items == null && <div className="text-sm text-muted">{t.lineageTools.loading}</div>}
              {history.items?.length === 0 && <div className="text-[13px] text-muted">{history.row.provenance === "SCANNED" ? lr.scannedNoEdit : lr.historyEmpty}</div>}
              {history.items?.map((h) => (
                <div key={h.changeId} className="border border-line rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{h.op === "CREATE" ? lr.opCreate : h.op === "UPDATE" ? lr.opUpdate : lr.opDelete}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${h.status === "APPLIED" ? "bg-emerald-50 text-emerald-700" : h.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {h.status === "APPLIED" ? lr.stApplied : h.status === "PENDING" ? lr.stPending : lr.stRejected}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {fmtDate(h.requestedAt)}{h.requestedBy ? ` · ${fill(lr.byName, { name: h.requestedBy })}` : ""} · {h.origin === "IMPORT" ? lr.originImport : h.origin === "REGISTER" ? lr.originRegister : lr.originDialog}
                    {h.requestId && <> · <Link href={`/requests/${h.requestId}`} className="underline">{fill(lr.requestNo, { id: h.requestId })}</Link></>}
                  </div>
                  {h.op !== "DELETE" && (h.typeCode || h.logic) && (
                    <div className="text-[12px] text-ink-soft mt-1.5">{h.typeCode}{h.logic ? <span className="font-mono text-[11px]"> — {h.logic}</span> : null}</div>
                  )}
                  {h.previous && h.op === "UPDATE" && (
                    <div className="text-[11px] text-muted mt-1">{lr.previously} {h.previous.transformation_type_code ?? "—"}{h.previous.transformation_logic_text ? ` — ${h.previous.transformation_logic_text}` : ""}</div>
                  )}
                  {h.note && <div className="text-[12px] text-ink mt-1.5 italic" dir="auto">“{h.note}”</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
