"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";
import type { DsrManifest, DsrRequest, DsrTable } from "@/lib/privacy/dsr";

type Options = { categoryId: number; name: string; identifiers: { attributeId: number; label: string; isKey: boolean; isPii: boolean }[] }[];
const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-sky-50 text-sky-700 border-sky-200", IN_PROGRESS: "bg-amber-50 text-amber-800 border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200", REJECTED: "bg-slate-100 text-slate-600 border-slate-200",
};
const ACTION_STYLE: Record<string, string> = {
  EXTRACT: "bg-sky-100 text-sky-800", CORRECT: "bg-violet-100 text-violet-800", RESTRICT: "bg-amber-100 text-amber-800",
  DELETE: "bg-red-100 text-red-800", ANONYMIZE: "bg-rose-100 text-rose-800", SCRAMBLE: "bg-rose-100 text-rose-800",
  ARCHIVE: "bg-slate-200 text-slate-700", RETAIN: "bg-emerald-100 text-emerald-800",
};
const ITEM_STYLE: Record<string, string> = { PENDING: "text-amber-700", DONE: "text-emerald-700", NOT_FOUND: "text-slate-600", EXEMPT: "text-violet-700" };

function DueBadge({ r }: { r: Pick<DsrRequest, "daysLeft" | "statusCode"> }) {
  const { t } = useLang();
  if (r.statusCode === "COMPLETED" || r.statusCode === "REJECTED") return null;
  const cls = r.daysLeft < 0 ? "text-red-700 bg-red-50 border-red-200" : r.daysLeft <= 7 ? "text-amber-800 bg-amber-50 border-amber-200" : "text-ink-soft bg-canvas-soft border-line";
  const text = r.daysLeft < 0 ? fill(t.dsr.overdue, { n: -r.daysLeft }) : r.daysLeft === 0 ? t.dsr.dueToday : fill(t.dsr.daysLeft, { n: r.daysLeft });
  return <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>{text}</span>;
}

export function DataSubjectRequestsTab({ userRole, initialId }: { userRole: string; initialId?: number | null }) {
  const { t } = useLang();
  const d = t.dsr;
  const canManage = userRole === "ADMIN" || userRole === "OFFICER";
  const [list, setList] = useState<DsrRequest[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(initialId ?? null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { fetch("/api/privacy/dsr").then((r) => (r.ok ? r.json() : [])).then(setList).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);

  if (openId != null) return <DsrDetail requestId={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-brand-deep">{d.title}</h2>
          <p className="text-[13px] text-muted mt-1 max-w-4xl">{d.desc}</p>
        </div>
        {canManage && <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm shrink-0">{d.newRequest}</button>}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-canvas-soft">
            <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
              <th className="px-4 py-2.5 text-start">{d.colReference}</th>
              <th className="px-4 py-2.5 text-start">{d.colType}</th>
              <th className="px-4 py-2.5 text-start">{d.colCategory}</th>
              <th className="px-4 py-2.5 text-start">{d.colReceived}</th>
              <th className="px-4 py-2.5 text-start">{d.colDue}</th>
              <th className="px-4 py-2.5 text-start">{d.colProgress}</th>
              <th className="px-4 py-2.5 text-start">{d.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {list?.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-sm text-muted">{d.empty}</td></tr>}
            {list?.map((r) => (
              <tr key={r.requestId} onClick={() => setOpenId(r.requestId)} className="border-t border-line-soft cursor-pointer hover:bg-canvas-soft/60">
                <td className="px-4 py-2.5">
                  <div className="text-[13px] font-semibold text-brand-purple">{r.referenceCode}</div>
                  {r.externalReference && <div className="text-[11px] text-muted" dir="auto">{r.externalReference}</div>}
                </td>
                <td className="px-4 py-2.5 text-[13px] text-ink">{(d.types as Record<string, string>)[r.requestType]}</td>
                <td className="px-4 py-2.5 text-[13px] text-ink-soft" dir="auto">{r.categoryName}</td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{r.receivedDate}</td>
                <td className="px-4 py-2.5 text-[12px] whitespace-nowrap"><div className="text-ink-soft">{r.dueDate}</div><DueBadge r={r} /></td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft">{r.itemsTotal - r.itemsOpen} / {r.itemsTotal}</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${STATUS_STYLE[r.statusCode]}`}>{(d.statuses as Record<string, string>)[r.statusCode]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <NewDsrDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </div>
  );
}

function NewDsrDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useLang();
  const d = t.dsr;
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ requestType: "ACCESS", categoryId: 0, identifierAttributeId: 0, externalReference: "", channel: "EMAIL", receivedDate: new Date().toISOString().slice(0, 10), correctionDetails: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/privacy/dsr?options=1").then((r) => (r.ok ? r.json() : [])).then((o: Options) => {
      setOptions(o);
      if (o[0]) setForm((f) => ({ ...f, categoryId: o[0].categoryId, identifierAttributeId: o[0].identifiers[0]?.attributeId ?? 0 }));
    });
  }, []);
  const cat = options?.find((c) => c.categoryId === form.categoryId);

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/privacy/dsr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { setError(res.error ?? d.failed); return; }
      onCreated(res.requestId);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl border border-line max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-start justify-between">
          <h2 className="text-[16px] font-bold text-brand-deep">{d.newRequest.replace("+ ", "")}</h2>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          {options?.length === 0 && <div className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{d.noCategories}</div>}
          <div>
            <label className="field-label">{d.requestType}</label>
            <select className="input-field w-full" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value })}>
              {Object.entries(d.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{d.category}</label>
              <select className="input-field w-full" value={form.categoryId} onChange={(e) => {
                const c = options?.find((x) => x.categoryId === Number(e.target.value));
                setForm({ ...form, categoryId: Number(e.target.value), identifierAttributeId: c?.identifiers[0]?.attributeId ?? 0 });
              }}>
                {options?.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-muted mt-1">{d.categoryHint}</p>
            </div>
            <div>
              <label className="field-label">{d.identifier}</label>
              <select className="input-field w-full" value={form.identifierAttributeId} onChange={(e) => setForm({ ...form, identifierAttributeId: Number(e.target.value) })}>
                {cat?.identifiers.map((i) => <option key={i.attributeId} value={i.attributeId}>{i.label}{i.isKey ? " (key)" : ""}</option>)}
              </select>
              <p className="text-[11px] text-muted mt-1">{d.identifierHint}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{d.externalReference}</label>
              <input className="input-field w-full" placeholder={d.externalReferencePh} value={form.externalReference} onChange={(e) => setForm({ ...form, externalReference: e.target.value })} dir="auto" />
            </div>
            <div>
              <label className="field-label">{d.channel}</label>
              <select className="input-field w-full" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {Object.entries(d.channels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">{d.receivedDate}</label>
            <input type="date" className="input-field" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
            <p className="text-[11px] text-muted mt-1">{fill(d.dueNote, { n: 30 })}</p>
          </div>
          {form.requestType === "CORRECTION" && (
            <div>
              <label className="field-label">{d.correctionDetails}</label>
              <textarea className="input-field w-full" rows={2} placeholder={d.correctionPh} value={form.correctionDetails} onChange={(e) => setForm({ ...form, correctionDetails: e.target.value })} dir="auto" />
            </div>
          )}
          <div>
            <label className="field-label">{d.notes}</label>
            <textarea className="input-field w-full" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="auto" />
          </div>
          {error && <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
          <button onClick={create} disabled={busy || !form.categoryId || !form.identifierAttributeId} className="btn btn-primary btn-sm">{busy ? d.creating : d.create}</button>
        </div>
      </div>
    </div>
  );
}

function DsrDetail({ requestId, onBack }: { requestId: number; onBack: () => void }) {
  const { t } = useLang();
  const d = t.dsr;
  const [m, setM] = useState<(DsrManifest & { canManage: boolean }) | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dialog, setDialog] = useState<"COMPLETE" | "REJECT" | "EXTEND" | null>(null);
  const load = useCallback(() => { fetch(`/api/privacy/dsr/${requestId}`).then((r) => (r.ok ? r.json() : null)).then(setM); }, [requestId]);
  useEffect(() => { load(); }, [load]);

  async function patch(body: object, okText?: string) {
    setMessage(null);
    const r = await fetch(`/api/privacy/dsr/${requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ kind: "err", text: res.error ?? d.failed }); return false; }
    if (okText) setMessage({ kind: "ok", text: fill(okText, { n: res.notified ?? 0 }) });
    load();
    return true;
  }

  if (!m) return <div className="card p-10 text-center text-sm text-muted">{d.loading}</div>;
  const r = m.request;
  const open = r.statusCode !== "COMPLETED" && r.statusCode !== "REJECTED";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[13px] text-brand-purple hover:underline">{d.back}</button>
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-brand-deep">{r.referenceCode}</h2>
              <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${STATUS_STYLE[r.statusCode]}`}>{(d.statuses as Record<string, string>)[r.statusCode]}</span>
              <DueBadge r={r} />
            </div>
            <div className="text-[13px] text-ink mt-1">{(d.types as Record<string, string>)[r.requestType]} · <span dir="auto">{m.category.name}</span></div>
            <div className="text-[12px] text-muted mt-0.5" dir="auto">
              {fill(d.identifiedBy, { col: `${m.identifier.source} › ${m.identifier.schema} › ${m.identifier.table}.${m.identifier.column}` })}
              {r.externalReference ? ` · ${r.externalReference}` : ""} · {d.colReceived} {r.receivedDate} · {d.colDue} {r.dueDate}
            </div>
            {r.extensionReason && <div className="text-[12px] text-amber-800 mt-0.5">{fill(d.extended, { reason: r.extensionReason })}</div>}
            {r.correctionDetails && <div className="text-[12px] text-ink-soft mt-0.5">{d.correctionDetails}: <span dir="auto">{r.correctionDetails}</span></div>}
            {r.responseSummary && <div className="text-[12px] text-ink mt-1.5 bg-canvas-soft rounded px-2 py-1" dir="auto">{r.responseSummary}</div>}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <a href={`/api/privacy/dsr/${requestId}?format=xlsx`} className="btn btn-sm">{d.exportExcel}</a>
            <a href={`/api/privacy/dsr/${requestId}?format=json`} className="btn btn-sm">{d.exportJson}</a>
            {m.canManage && open && (
              <>
                <button onClick={() => patch({ action: "NOTIFY" }, d.notified)} className="btn btn-sm">{d.notifyOwners}</button>
                <button onClick={() => patch({ action: "REFRESH" })} className="btn btn-sm" title={d.refresh}>↻</button>
                <button onClick={() => setDialog("EXTEND")} className="btn btn-sm">{d.extend}</button>
                <button onClick={() => setDialog("REJECT")} className="btn btn-sm">{d.reject}</button>
                <button onClick={() => setDialog("COMPLETE")} className="btn btn-primary btn-sm">{d.complete}</button>
              </>
            )}
            {m.canManage && !open && <button onClick={() => patch({ action: "REOPEN" })} className="btn btn-sm">{d.reopen}</button>}
          </div>
        </div>
        {!m.canManage && <p className="text-[12px] text-muted mt-2">{d.viewOnly}</p>}
      </div>

      {message && (
        <div className={`text-[13px] rounded-md px-4 py-2.5 border flex justify-between ${message.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
          <span>{message.text}</span><button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {m.warnings.length > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50/60">
          <div className="text-[12px] font-bold text-amber-900 mb-1">{d.warnings}</div>
          <ul className="list-disc ps-5 space-y-0.5 text-[13px] text-amber-900">{m.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1">{d.schedule}</div>
          {m.schedule ? (
            <div className="text-[13px] text-ink">
              {m.schedule.jurisdiction}: {m.schedule.period} {m.schedule.unit.toLowerCase()} · {m.schedule.triggerEvent} → <b>{(d.actions as Record<string, string>)[m.schedule.action] ?? m.schedule.action}</b>
              {m.schedule.technique && ` (${m.schedule.technique})`}
              {m.schedule.reference && <div className="text-[11px] text-muted mt-0.5">{m.schedule.reference}</div>}
            </div>
          ) : <div className="text-[13px] text-muted">{d.noSchedule}</div>}
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1">{d.holds}</div>
          {m.categoryHolds.length === 0 && m.tables.every((x) => x.holdRules.length === 0)
            ? <div className="text-[13px] text-muted">{d.none}</div>
            : <div className="text-[13px] text-ink space-y-0.5">
                {m.categoryHolds.map((h) => <div key={h.holdId}>{h.caseReference} — {h.caseName}</div>)}
                {[...new Set(m.tables.flatMap((x) => x.holdRules.map((h) => `${h.caseReference} (${x.name})`)))].map((s) => <div key={s}>{s}</div>)}
              </div>}
        </div>
      </div>

      <div>
        <div className="text-[13px] font-bold text-ink mb-2">{fill(d.pathTitle, { n: m.tables.length })}</div>
        <div className="space-y-3">
          {[...m.tables].sort((a, b) => a.executionOrder - b.executionOrder).map((x) => (
            <TableCard key={x.entityId} x={x} requestId={requestId} canAct={open /* admins, officers and the stewards handling a table record progress */} onSaved={load} onError={(text) => setMessage({ kind: "err", text })} />
          ))}
        </div>
      </div>

      {m.unreachable.length > 0 && (
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1">{d.unreachable}</div>
          <div className="text-[13px] text-ink">{m.unreachable.map((u) => u.name).join(", ")}</div>
        </div>
      )}

      {m.downstreamCopies.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 pt-4">
            <div className="text-[13px] font-bold text-ink">{d.downstream}</div>
            <p className="text-[12px] text-muted mt-0.5 mb-3">{d.downstreamHint}</p>
          </div>
          <table className="w-full">
            <thead className="bg-canvas-soft">
              <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                <th className="px-4 py-2 text-start">{d.copyFrom}</th><th className="px-4 py-2 text-start">{d.copyTo}</th><th className="px-4 py-2 text-start">{d.isPi}</th>
              </tr>
            </thead>
            <tbody>
              {m.downstreamCopies.map((c, i) => (
                <tr key={i} className="border-t border-line-soft text-[12px]">
                  <td className="px-4 py-2 font-mono" dir="ltr">{c.fromTable}.{c.fromColumn}</td>
                  <td className="px-4 py-2"><span className="font-mono" dir="ltr">{c.table}.{c.column}</span> <span className="text-muted">· {c.source} › {c.schema}</span></td>
                  <td className="px-4 py-2">{c.isPii ? <span className="text-red-700 font-semibold">{d.isPi}</span> : <span className="text-muted">{d.notClassified}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && <CloseDialog kind={dialog} dueDate={r.dueDate} onClose={() => setDialog(null)} onSubmit={async (body) => { if (await patch(body)) setDialog(null); }} />}
    </div>
  );
}

function TableCard({ x, requestId, canAct, onSaved, onError }: { x: DsrTable; requestId: number; canAct: boolean; onSaved: () => void; onError: (t: string) => void }) {
  const { t } = useLang();
  const d = t.dsr;
  const [status, setStatus] = useState(x.item?.status ?? "PENDING");
  const [note, setNote] = useState(x.item?.note ?? "");
  const [showSql, setShowSql] = useState(false);
  const dirty = status !== (x.item?.status ?? "PENDING") || note !== (x.item?.note ?? "");

  async function save() {
    if (!x.item) return;
    const r = await fetch(`/api/privacy/dsr/${requestId}/items/${x.item.itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note }) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) { onError(res.error ?? d.failed); return; }
    onSaved();
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-muted">{fill(d.order, { n: x.executionOrder })}</span>
            <span className="text-[14px] font-semibold text-ink" dir="auto">{x.name}</span>
            <span className="text-[11px] text-muted" dir="auto">{x.source} › {x.schema}</span>
            <span className="text-[10px] font-semibold text-ink-soft bg-canvas-soft rounded px-1.5 py-0.5">{x.isRoot ? d.hopRoot : fill(d.hop, { n: x.hop })}</span>
          </div>
          {!x.isRoot && (
            <div className="text-[11px] text-muted mt-0.5 font-mono" dir="ltr">
              {fill(d.via, { path: x.path.map((p) => `${p.fromTable}.${p.fromColumn} → ${p.toTable}.${p.toColumn}`).join(" → ") })}
            </div>
          )}
        </div>
        <span className={`text-[11px] font-bold rounded px-2 py-1 shrink-0 ${ACTION_STYLE[x.action] ?? "bg-slate-100 text-slate-700"}`}>{(d.actions as Record<string, string>)[x.action] ?? x.action}</span>
      </div>
      <div className="text-[13px] text-ink mt-2">{x.actionReason}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted me-1">{d.piColumns}:</span>
        {x.piColumns.length === 0 && <span className="text-[11px] text-muted">{d.noPi}</span>}
        {x.piColumns.map((c) => (
          <span key={c.attributeId} className="text-[11px] border border-red-200 bg-red-50 text-red-800 rounded px-1.5 py-0.5" title={[c.classification, c.piCategory, c.dataType].filter(Boolean).join(" · ")}>
            <span className="font-mono" dir="ltr">{c.name}</span>{c.piCategory && <span className="opacity-70"> · {c.piCategory}</span>}
          </span>
        ))}
      </div>
      {(x.retentionRule || x.holdRules.length > 0) && (
        <div className="mt-2 text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 space-y-0.5">
          {x.retentionRule && <div>{d.keepRows}: {x.retentionRule}</div>}
          {x.holdRules.map((h, i) => <div key={i}>{d.keepRows} {fill(d.holdRule, { ref: h.caseReference, cond: `${h.attributeName} ${h.operator} ${h.valueText}${h.valueText2 ? ` / ${h.valueText2}` : ""}` })}</div>)}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] text-muted">{d.owners}: {x.owners.length ? x.owners.join(", ") : d.noOwner}</div>
        <button onClick={() => setShowSql((s) => !s)} className="text-[12px] text-brand-purple hover:underline">{d.locate} {showSql ? "︿" : "⌄"}</button>
      </div>
      {showSql && <pre className="mt-2 font-mono text-[12px] bg-slate-900 text-emerald-200 rounded-lg p-3 whitespace-pre-wrap" dir="ltr">{x.locateSql}</pre>}

      <div className="mt-3 pt-3 border-t border-line-soft flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-muted">{d.statusLabel}:</span>
        {canAct && x.item ? (
          <>
            <select className="input-field w-auto text-[12px]" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(d.itemStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="input-field flex-1 min-w-[200px] text-[12px]" placeholder={d.notePh} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" />
            <button onClick={save} disabled={!dirty} className="btn btn-sm">{d.save}</button>
          </>
        ) : (
          <span className={`text-[12px] font-semibold ${ITEM_STYLE[x.item?.status ?? "PENDING"]}`}>{(d.itemStatuses as Record<string, string>)[x.item?.status ?? "PENDING"]}{x.item?.note ? ` — ${x.item.note}` : ""}</span>
        )}
        {x.item?.updatedBy && <span className="text-[11px] text-muted">· {x.item.updatedBy}</span>}
      </div>
    </div>
  );
}

function CloseDialog({ kind, dueDate, onClose, onSubmit }: { kind: "COMPLETE" | "REJECT" | "EXTEND"; dueDate: string; onClose: () => void; onSubmit: (body: object) => void }) {
  const { t } = useLang();
  const d = t.dsr;
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => { const x = new Date(dueDate); x.setDate(x.getDate() + 30); return x.toISOString().slice(0, 10); });
  const title = kind === "COMPLETE" ? d.complete : kind === "REJECT" ? d.reject : d.extend;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line"><h2 className="text-[16px] font-bold text-brand-deep">{title}</h2></div>
        <div className="px-6 py-5 space-y-3">
          {kind === "EXTEND" && (
            <div>
              <label className="field-label">{d.newDueDate}</label>
              <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div>
            <label className="field-label">{kind === "COMPLETE" ? d.responseSummary : kind === "REJECT" ? d.rejectReason : d.extensionReason}</label>
            <textarea className="input-field w-full" rows={3} value={text} onChange={(e) => setText(e.target.value)} dir="auto" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
          <button disabled={!text.trim()} onClick={() => onSubmit(kind === "COMPLETE" ? { action: kind, responseSummary: text } : kind === "REJECT" ? { action: kind, reason: text } : { action: kind, reason: text, newDueDate: date })} className="btn btn-primary btn-sm">{d.confirm}</button>
        </div>
      </div>
    </div>
  );
}

