"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FoiRequestSummary } from "@/lib/queries/foi";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:                "Submitted",
  TRIAGE:                   "In Triage",
  CLARIFICATION_REQUESTED:  "Clarification Requested",
  ASSESSMENT:               "Assessment",
  QUOTED:                   "Quoted",
  QUOTE_ACCEPTED:           "Quote Accepted",
  IN_FULFILLMENT:           "In Fulfillment",
  AWAITING_PAYMENT:         "Awaiting Payment",
  DELIVERED:                "Delivered",
  CLOSED:                   "Closed",
  REJECTED:                 "Rejected",
  APPEAL_OPEN:              "Appeal Open",
  APPEAL_DECIDED:           "Appeal Decided",
  QUOTE_DECLINED:           "Quote Declined",
  WITHDRAWN:                "Withdrawn",
};

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

function SlaChip({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted text-[11px]">—</span>;
  if (days < 0)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Overdue {Math.abs(days)}d</span>;
  if (days <= 5) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{days}d left</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">{days}d left</span>;
}

export function FoiQueue() {
  const router = useRouter();
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
    { key: "ACTIVE",    label: "Active" },
    { key: "ALL",       label: "All" },
    { key: "SUBMITTED", label: "Submitted" },
    { key: "TRIAGE",    label: "In Triage" },
    { key: "ASSESSMENT",label: "Assessment" },
    { key: "QUOTED",    label: "Quoted" },
    { key: "IN_FULFILLMENT", label: "In Fulfillment" },
    { key: "AWAITING_PAYMENT", label: "Awaiting Payment" },
    { key: "REJECTED",  label: "Rejected" },
    { key: "DELIVERED", label: "Delivered" },
  ];

  return (
    <div className="p-8 max-w-[1300px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Freedom of Information</h1>
          <p className="text-sm text-muted mt-1">Manage public information requests and track SLA compliance</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/foi-request"
            target="_blank"
            className="btn btn-sm text-[12px]"
          >
            ↗ Public Intake Form
          </a>
          <button
            onClick={() => router.push("/foi/new")}
            className="btn btn-primary btn-sm"
          >
            + Register Request
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Requests", value: stats.total,          color: "text-ink" },
            { label: "Active Cases",   value: stats.active,         color: "text-brand-purple" },
            { label: "Overdue",        value: stats.overdue,        color: stats.overdue > 0 ? "text-red-600" : "text-green-600" },
            { label: "Awaiting Action",value: stats.awaitingAction, color: stats.awaitingAction > 0 ? "text-amber-600" : "text-green-600" },
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
        <div className="ml-auto">
          <input
            className="input input-sm w-56"
            placeholder="Search reference, subject, name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_160px_100px_100px_120px_80px] gap-0 px-5 py-2.5 bg-canvas-soft text-[10px] font-bold uppercase tracking-wider text-muted border-b border-line">
          <div>Reference</div>
          <div>Subject / Requester</div>
          <div>Assigned Officer</div>
          <div>Submitted</div>
          <div>SLA</div>
          <div>Status</div>
          <div>Channel</div>
        </div>

        {loading && (
          <div className="py-16 text-center text-muted text-sm">Loading…</div>
        )}

        {!loading && rows.length === 0 && (
          <div className="py-16 text-center text-muted text-sm">
            No requests found.{status === "ACTIVE" && " All clear!"}
          </div>
        )}

        {!loading && rows.map(row => (
          <div
            key={row.foiRequestId}
            onClick={() => router.push(`/foi/${row.foiRequestId}`)}
            className="grid grid-cols-[120px_1fr_160px_100px_100px_120px_80px] gap-0 px-5 py-3.5 border-b border-line-soft hover:bg-canvas-soft cursor-pointer items-center"
          >
            <div className="text-[12px] font-mono font-semibold text-brand-purple">{row.referenceCode}</div>

            <div className="min-w-0 pr-4">
              <div className="text-sm font-medium text-ink truncate">{row.subjectText}</div>
              <div className="text-[11px] text-muted truncate">{row.requesterName} · {row.requesterEmail}</div>
            </div>

            <div className="text-[12px] text-ink-soft truncate">
              {row.assignedOfficerName ?? <span className="italic text-muted">Unassigned</span>}
            </div>

            <div className="text-[11px] text-muted">
              {new Date(row.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </div>

            <div>
              <SlaChip days={row.slaBusinessDaysLeft} />
            </div>

            <div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[row.statusCode] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[row.statusCode] ?? row.statusCode}
              </span>
            </div>

            <div className="text-[11px] text-muted uppercase">{row.channelCode}</div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted">
          <span>{total} total</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn btn-sm">← Prev</button>
            <span className="self-center">Page {page}</span>
            <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="btn btn-sm">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
