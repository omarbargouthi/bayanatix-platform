"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { statusLabels, STATUS_COLORS, scopeLabels, directionLabels } from "@/lib/sharing-routing";
import type { DsaSummary } from "@/lib/queries/sharing";
import { useLang } from "@/lib/lang-context";

const CLASS_COLORS: Record<string, string> = {
  PUBLIC:       "bg-green-100 text-green-700",
  INTERNAL:     "bg-blue-100 text-blue-700",
  CONFIDENTIAL: "bg-amber-100 text-amber-700",
  RESTRICTED:   "bg-amber-100 text-amber-700",
  SECRET:       "bg-red-100 text-red-700",
  TOP_SECRET:   "bg-gray-800 text-white",
};

const ALL_STATUSES = [
  "DRAFT","VALIDATION","OWNER_REVIEW","PRIVACY_REVIEW","DMO_REVIEW",
  "EXEC_APPROVAL","APPROVED","ACTIVE","SUSPENDED","TERMINATED","EXPIRED","RENEWAL_DRAFT",
];

const ALL_SCOPES = ["INTERNAL","EXTERNAL_GOV","EXTERNAL_PRIVATE"];

export function DsaRegistry() {
  const router = useRouter();
  const { t } = useLang();
  const s = t.sharing;
  const STATUS_LABELS = statusLabels(s);
  const SCOPE_LABELS = scopeLabels(s);
  const DIRECTION_LABELS = directionLabels(s);
  const [dsas, setDsas]         = useState<DsaSummary[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [status, setStatus]     = useState("all");
  const [scope, setScope]       = useState("all");
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), limit: "20", search, status, scope,
    });
    const r = await fetch(`/api/sharing/dsas?${qs}`);
    const data = await r.json();
    setDsas(data.data ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, search, status, scope]);

  useEffect(() => { load(); }, [load]);

  async function deleteDsa(dsaId: number, title: string) {
    if (!confirm(s.deleteConfirm.replace("{title}", title))) return;
    setDeleting(dsaId);
    await fetch(`/api/sharing/dsas/${dsaId}`, { method: "DELETE" });
    setDeleting(null);
    load();
  }

  async function createDsa() {
    setCreating(true);
    const r = await fetch("/api/sharing/dsas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleText: s.newAgreementTitle, sharingScopeCode: "INTERNAL", directionCode: "PROVIDER" }),
    });
    const data = await r.json();
    setCreating(false);
    router.push(`/sharing/${data.dsaId}`);
  }

  const totalPages = Math.ceil(total / 20);

  // Summary counts by status
  const active  = dsas.filter(d => d.statusCode === "ACTIVE").length;
  const pending = dsas.filter(d => ["OWNER_REVIEW","PRIVACY_REVIEW","DMO_REVIEW","EXEC_APPROVAL"].includes(d.statusCode)).length;
  const expiring30 = dsas.filter(d => {
    if (!d.effectiveEndDate || d.statusCode !== "ACTIVE") return false;
    const diff = (new Date(d.effectiveEndDate).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 30;
  }).length;

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{s.pageTitle}</h1>
          <p className="text-sm text-muted mt-1">{s.pageDesc}</p>
        </div>
        <button
          onClick={createDsa}
          disabled={creating}
          className="btn btn-primary"
        >
          {creating ? s.creatingEllipsis : s.newAgreement}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard label={s.summaryActive} value={active} color="text-green-600" />
        <SummaryCard label={s.summaryPending}  value={pending} color="text-amber-600" />
        <SummaryCard label={s.summaryExpiring} value={expiring30} color="text-red-600" />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="input flex-1 min-w-[180px]"
          placeholder={s.searchPlaceholder}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="input w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">{s.allStatuses}</option>
          {ALL_STATUSES.map(st => <option key={st} value={st}>{STATUS_LABELS[st] ?? st}</option>)}
        </select>
        <select className="input w-52" value={scope} onChange={e => { setScope(e.target.value); setPage(1); }}>
          <option value="all">{s.allScopes}</option>
          {ALL_SCOPES.map(sc => <option key={sc} value={sc}>{SCOPE_LABELS[sc] ?? sc}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_130px_100px_120px_80px_90px_80px_36px] gap-2 px-5 py-2.5 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div>{s.colAgreement}</div>
          <div>{s.colCounterparty}</div>
          <div>{s.colScope}</div>
          <div>{s.colMaxClass}</div>
          <div>{s.colDatasets}</div>
          <div>{s.colExpiry}</div>
          <div>{s.colStatus}</div>
          <div></div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted">{t.common.loading}</div>
        ) : dsas.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-muted text-sm">{s.noAgreements}</div>
            <button onClick={createDsa} className="btn btn-primary btn-sm mt-4">{s.createFirst}</button>
          </div>
        ) : (
          dsas.map(dsa => (
            <div
              key={dsa.dsaId}
              onClick={() => router.push(`/sharing/${dsa.dsaId}`)}
              className="grid grid-cols-[1fr_130px_100px_120px_80px_90px_80px_36px] gap-2 px-5 py-3.5 border-b border-line-soft last:border-0 hover:bg-canvas-soft transition-colors items-center cursor-pointer"
            >
              <div>
                <div className="font-medium text-sm text-ink truncate">{dsa.titleText}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {dsa.dsaReferenceCode && (
                    <span className="font-mono text-[10px] text-brand-purple">{dsa.dsaReferenceCode}</span>
                  )}
                  <span className="text-[10px] text-muted">{DIRECTION_LABELS[dsa.directionCode] ?? dsa.directionCode}</span>
                  {dsa.containsPersonalData && (
                    <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">{s.piBadge}</span>
                  )}
                </div>
              </div>
              <div className="text-sm text-ink truncate">{dsa.counterpartyNameText ?? <span className="text-muted italic">—</span>}</div>
              <div className="text-[11px] text-muted">{SCOPE_LABELS[dsa.sharingScopeCode] ?? dsa.sharingScopeCode}</div>
              <div>
                {dsa.maxClassificationCode
                  ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${CLASS_COLORS[dsa.maxClassificationCode] ?? "bg-gray-100 text-gray-600"}`}>{dsa.maxClassificationCode}</span>
                  : <span className="text-muted italic text-[11px]">{s.notSet}</span>}
              </div>
              <div className="text-sm text-muted text-center">{dsa.datasetCount}</div>
              <div className="text-[11px] text-muted">{dsa.effectiveEndDate ?? "—"}</div>
              <div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[dsa.statusCode] ?? "bg-gray-100 text-gray-500"}`}>
                  {STATUS_LABELS[dsa.statusCode] ?? dsa.statusCode}
                </span>
              </div>
              <div className="flex justify-center">
                {["DRAFT","RENEWAL_DRAFT"].includes(dsa.statusCode) && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteDsa(dsa.dsaId, dsa.titleText); }}
                    disabled={deleting === dsa.dsaId}
                    title={s.deleteDraftTitle}
                    className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    {deleting === dsa.dsaId ? "…" : "✕"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted">
          <span>{s.agreementsTotal.replace("{n}", String(total))}</span>
          <div className="flex gap-2">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{s.prevPage}</button>
            <span className="px-2 py-1">{s.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
            <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{s.nextPage}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-5">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-muted mt-1">{label}</div>
    </div>
  );
}
