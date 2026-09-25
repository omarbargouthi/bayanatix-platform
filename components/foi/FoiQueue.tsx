"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FoiRequestSummary } from "@/lib/queries/foi";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:                "bg-blue-100 text-blue-700",
  TRIAGE:                   "bg-amber-100 text-amber-700",
  CLARIFICATION_REQUESTED:  "bg-purple-100 text-purple-700",
  ASSESSMENT:               "bg-orange-100 text-orange-700",
  QUOTED:                   "bg-cyan-100 text-cyan-700",
  QUOTE_ACCEPTED:           "bg-teal-100 text-teal-700",
  IN_FULFILLMENT:           "bg-indigo-100 text-indigo-700",
  AWAITING_PAYMENT:         "bg-yellow-100 text-yellow-700",
  DELIVERED:                "bg-green-100 text-green-700",
  CLOSED:                   "bg-gray-100 text-gray-500",
  REJECTED:                 "bg-red-100 text-red-600",
  APPEAL_OPEN:              "bg-red-100 text-red-700",
  APPEAL_DECIDED:           "bg-gray-100 text-gray-500",
  QUOTE_DECLINED:           "bg-gray-100 text-gray-500",
  WITHDRAWN:                "bg-gray-100 text-gray-500",
};

type Stats = { total: number; active: number; overdue: number; awaitingAction: number };

function SlaChip({ days, t }: { days: number | null; t: I18nStrings["foi"]["queue"] }) {
  if (days === null) return <span className="text-muted text-[11px]">—</span>;
  if (days < 0)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{t.slaOverdue.replace("{n}", String(Math.abs(days)))}</span>;
  if (days <= 5) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{t.slaLeft.replace("{n}", String(days))}</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">{t.slaLeft.replace("{n}", String(days))}</span>;
}

export function FoiQueue() {
  const router = useRouter();
  const { t } = useLang();
  const c = t.foi.queue;
  const [rows,    setRows]    = useState<FoiRequestSummary[]>([]);
  const [total,   setTotal]   = useState(0);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("ACTIVE");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" });
      if (status !== "ALL") p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      const r = await fetch(`/api/foi?${p}`);
      if (r.ok) {
        const data = await r.json();
        setRows(data.rows);
        setTotal(data.total);
        setStats(data.stats);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const statusFilters = [
    { key: "ACTIVE",    label: c.filterActive },
    { key: "ALL",       label: c.filterAll },
    { key: "SUBMITTED", label: t.foi.status.SUBMITTED },
    { key: "TRIAGE",    label: t.foi.status.TRIAGE },
    { key: "ASSESSMENT",label: t.foi.status.ASSESSMENT },
    { key: "QUOTED",    label: t.foi.status.QUOTED },
    { key: "IN_FULFILLMENT", label: t.foi.status.IN_FULFILLMENT },
    { key: "AWAITING_PAYMENT", label: t.foi.status.AWAITING_PAYMENT },
    { key: "REJECTED",  label: t.foi.status.REJECTED },
    { key: "DELIVERED", label: t.foi.status.DELIVERED },
  ];

  return (
    <div className="p-8 max-w-[1300px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{c.pageTitle}</h1>
          <p className="text-sm text-muted mt-1">{c.pageDesc}</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/foi-request"
            target="_blank"
            className="btn btn-sm text-[12px]"
          >
            {c.publicIntakeLink}
          </a>
          <button
            onClick={() => router.push("/foi/new")}
            className="btn btn-primary btn-sm"
          >
            {c.registerRequest}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: c.statTotal,          value: stats.total,          color: "text-ink" },
            { label: c.statActive,         value: stats.active,         color: "text-brand-purple" },
            { label: c.statOverdue,        value: stats.overdue,        color: stats.overdue > 0 ? "text-red-600" : "text-green-600" },
            { label: c.statAwaitingAction, value: stats.awaitingAction, color: stats.awaitingAction > 0 ? "text-amber-600" : "text-green-600" },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map(f => (
            <button
              key={f.key}
              onClick={() => { setStatus(f.key); setPage(1); }}
              className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                status === f.key
                  ? "bg-brand-purple text-white border-brand-purple"
                  : "bg-white text-ink-soft border-line hover:border-brand-purple"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ms-auto">
          <input
            className="input input-sm w-56"
            dir="auto"
            placeholder={c.searchPlaceholder}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_160px_100px_100px_120px_80px] gap-0 px-5 py-2.5 bg-canvas-soft text-[10px] font-bold uppercase tracking-wider text-muted border-b border-line">
          <div className="min-w-0 truncate">{c.colReference}</div>
          <div className="min-w-0 truncate">{c.colSubject}</div>
          <div className="min-w-0 truncate">{c.colOfficer}</div>
          <div className="min-w-0 truncate">{c.colSubmitted}</div>
          <div className="min-w-0 truncate">{c.colSla}</div>
          <div className="min-w-0 truncate">{c.colStatus}</div>
          <div className="min-w-0 truncate">{c.colChannel}</div>
        </div>

        {loading && (
          <div className="py-16 text-center text-muted text-sm">{t.common.loading}</div>
        )}

        {!loading && rows.length === 0 && (
          <div className="py-16 text-center text-muted text-sm">
            {c.noResults}{status === "ACTIVE" && ` ${c.allClear}`}
          </div>
        )}

        {!loading && rows.map(row => (
          <div
            key={row.foiRequestId}
            onClick={() => router.push(`/foi/${row.foiRequestId}`)}
            className="grid grid-cols-[120px_1fr_160px_100px_100px_120px_80px] gap-0 px-5 py-3.5 border-b border-line-soft hover:bg-canvas-soft cursor-pointer items-center"
          >
            <div className="min-w-0 text-[12px] font-mono font-semibold text-brand-purple truncate" dir="ltr">{row.referenceCode}</div>

            <div className="min-w-0 pe-4">
              <div className="text-sm font-medium text-ink truncate" dir="auto">{row.subjectText}</div>
              <div className="text-[11px] text-muted truncate">{row.requesterName} · {row.requesterEmail}</div>
            </div>

            <div className="min-w-0 text-[12px] text-ink-soft truncate">
              {row.assignedOfficerName ?? <span className="italic text-muted">{c.unassigned}</span>}
            </div>

            <div className="min-w-0 text-[11px] text-muted truncate">
              {new Date(row.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </div>

            <div className="min-w-0">
              <SlaChip days={row.slaBusinessDaysLeft} t={c} />
            </div>

            <div className="min-w-0">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[row.statusCode] ?? "bg-gray-100 text-gray-600"}`}>
                {t.foi.status[row.statusCode as keyof typeof t.foi.status] ?? row.statusCode}
              </span>
            </div>

            <div className="min-w-0 text-[11px] text-muted uppercase truncate">{row.channelCode}</div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted">
          <span>{c.totalCount.replace("{n}", String(total))}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn btn-sm">{c.prev}</button>
            <span className="self-center">{c.page.replace("{n}", String(page))}</span>
            <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="btn btn-sm">{c.next}</button>
          </div>
        </div>
      )}
    </div>
  );
}
