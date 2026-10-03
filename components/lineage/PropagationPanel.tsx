"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { usePollBackgroundJob } from "@/components/shared/BackgroundJobsPanel";

type Row = {
  propagationId: number; field: string; mode: "AUTO" | "SUGGEST"; status: string;
  targetType: string; targetId: number; targetLabel: string | null; targetEntityId: number | null; targetSchemaId: number | null;
  sourceLabel: string | null; valueLabel: string | null; valueText: string | null; classCode: string | null; isPii: boolean | null;
  hop: number; reason: string | null; createdAt: string; decidedAt: string | null; decidedBy: string | null;
};
type View = "SUGGESTED" | "APPLIED" | "HISTORY";
const FIELDS = ["CLASSIFICATION", "BUSINESS_TERM", "DESCRIPTION", "TAG", "RETENTION"] as const;

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

// Lineage › Propagation: what flowed downstream automatically, and the
// suggestions waiting for a steward (lib/lineage/propagation.ts).
export function PropagationPanel({ canManage }: { canManage: boolean }) {
  const { t } = useLang();
  const lp = t.lineagePropagation;
  const fieldLabel = (f: string) => (lp as Record<string, string>)[`field${f}`] ?? f;

  const [view, setView] = useState<View>("SUGGESTED");
  const [field, setField] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Row[]; total: number; counts: { suggested: number; applied: number } } | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const job = usePollBackgroundJob(jobId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ view, page: String(page) });
    if (field) p.set("field", field);
    if (q.trim()) p.set("q", q.trim());
    fetch(`/api/lineage/propagation?${p}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [view, field, q, page]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load, reload]);
  useEffect(() => { setPage(1); }, [view, field, q]);
  useEffect(() => { if (job && job.status !== "RUNNING") setReload((n) => n + 1); }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id: number, action: "ACCEPT" | "REJECT") {
    setBusyId(id); setError(null);
    try {
      const r = await fetch(`/api/lineage/propagation/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? lp.decideFailed); return; }
      setReload((n) => n + 1);
    } finally { setBusyId(null); }
  }

  async function runNow() {
    setError(null);
    const r = await fetch("/api/lineage/propagation", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? lp.runFailed); return; }
    setJobId(d.jobId);
  }

  const result = job?.resultJson as { applied?: number; removed?: number; suggested?: number } | null | undefined;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  const assetLink = (r: Row) => r.targetEntityId && r.targetSchemaId ? `/catalog/${r.targetSchemaId}/tables/${r.targetEntityId}` : null;

  const value = (r: Row) => (
    <div className="min-w-0">
      {r.field === "DESCRIPTION"
        ? <div className="text-[12px] text-ink line-clamp-2" dir="auto" title={r.valueText ?? ""}>{r.valueText}</div>
        : <div className="text-[13px] text-ink truncate" dir="auto">{r.valueLabel ?? "—"}</div>}
      {r.field === "CLASSIFICATION" && (r.classCode || r.isPii) && (
        <div className="flex items-center gap-1 mt-0.5">
          {r.classCode && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-canvas-soft text-ink-soft border border-line">{r.classCode}</span>}
          {r.isPii && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">{lp.pii}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-brand-deep">{lp.title}</h2>
            <p className="text-[13px] text-muted mt-0.5 max-w-3xl">{lp.desc}</p>
          </div>
          {canManage && (
            <button onClick={runNow} disabled={job?.status === "RUNNING"} className="btn btn-primary btn-sm shrink-0">
              {job?.status === "RUNNING" ? lp.running : lp.runNow}
            </button>
          )}
        </div>
        {job?.status === "COMPLETED" && result && (
          <div className="mb-3 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            {fill(lp.lastRun, { applied: result.applied ?? 0, removed: result.removed ?? 0, suggested: result.suggested ?? 0 })}
          </div>
        )}
        {job?.status === "FAILED" && <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{job.errorText ?? lp.runFailed}</div>}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-line overflow-hidden text-[13px] font-medium">
            {(["SUGGESTED", "APPLIED", "HISTORY"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3.5 py-2 transition-colors ${view === v ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}>
                {v === "SUGGESTED" ? lp.viewSuggested : v === "APPLIED" ? lp.viewApplied : lp.viewHistory}
                {v === "SUGGESTED" && data ? ` (${data.counts.suggested})` : v === "APPLIED" && data ? ` (${data.counts.applied})` : ""}
              </button>
            ))}
          </div>
          <select className="input-field w-auto" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">{lp.allFields}</option>
            {FIELDS.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
          </select>
          <input className="input-field flex-1 min-w-[220px]" placeholder={lp.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2.5">{error}</div>}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-soft">
          <span className="text-[13px] text-muted">{data ? fill(lp.count, { n: data.total }) : ""}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-sm">{t.lineageRegister.prev}</button>
              <span className="text-[12px] text-muted">{fill(t.lineageRegister.pageOf, { page, total: totalPages })}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-sm">{t.lineageRegister.next}</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-canvas-soft">
              <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                <th className="px-4 py-2.5 text-start">{lp.colField}</th>
                <th className="px-4 py-2.5 text-start">{lp.colValue}</th>
                <th className="px-4 py-2.5 text-start">{lp.colFrom}</th>
                <th className="px-4 py-2.5 text-start">{lp.colTo}</th>
                <th className="px-4 py-2.5 text-start">{view === "HISTORY" ? lp.colStatus : lp.colReason}</th>
                <th className="px-4 py-2.5 text-start">{lp.colWhen}</th>
                {view === "SUGGESTED" && canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {data?.rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-sm text-muted">{lp.empty}</td></tr>}
              {data?.rows.map((r) => (
                <tr key={r.propagationId} className="border-t border-line-soft align-top">
                  <td className="px-4 py-2.5 text-[12px] font-semibold text-brand-deep whitespace-nowrap">{fieldLabel(r.field)}</td>
                  <td className="px-4 py-2.5 max-w-[260px]">{value(r)}</td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-soft max-w-[220px]"><div className="truncate" dir="auto" title={r.sourceLabel ?? ""}>{r.sourceLabel}</div>
                    {r.mode === "AUTO" && r.hop > 1 && <div className="text-[11px] text-muted">{fill(lp.hops, { n: r.hop })}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] max-w-[220px]">
                    {assetLink(r)
                      ? <Link href={assetLink(r)!} className="text-brand-purple hover:underline truncate block" dir="auto" title={r.targetLabel ?? ""}>{r.targetLabel}</Link>
                      : <span className="truncate block" dir="auto">{r.targetLabel}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-soft max-w-[240px]">
                    {view === "HISTORY"
                      ? <><span className="font-semibold">{(lp as Record<string, string>)[`st${r.status}`] ?? r.status}</span>{r.decidedBy ? ` · ${r.decidedBy}` : ""}{r.reason && r.status === "SUPERSEDED" ? <div className="text-[11px] text-muted">{r.reason}</div> : null}</>
                      : r.reason}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-muted whitespace-nowrap">{fmt(r.decidedAt ?? r.createdAt)}</td>
                  {view === "SUGGESTED" && canManage && (
                    <td className="px-4 py-2.5 whitespace-nowrap text-end">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => decide(r.propagationId, "ACCEPT")} disabled={busyId === r.propagationId} className="btn btn-primary btn-sm text-[12px]">{lp.accept}</button>
                        <button onClick={() => decide(r.propagationId, "REJECT")} disabled={busyId === r.propagationId} className="btn btn-sm text-[12px]">{lp.reject}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
