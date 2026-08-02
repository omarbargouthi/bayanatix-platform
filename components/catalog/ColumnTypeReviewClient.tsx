"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

type SuggestionRow = {
  attributeId: number;
  physicalName: string;
  friendlyName: string | null;
  entityId: number;
  entityName: string;
  schemaId: number;
  schemaName: string;
  suggestedClass: string | null;
  confidence: number | null;
  band: "HIGH" | "MEDIUM" | "LOW" | null;
  status: string;
  rationale: string | { terminal_rule: string; hits: { rule: string; detail: string }[] } | null;
  currentClass: string | null;
};

function parseRationale(r: SuggestionRow["rationale"]): { terminal_rule: string; hits: { rule: string; detail: string }[] } | null {
  if (!r) return null;
  if (typeof r === "string") {
    try { return JSON.parse(r); } catch { return null; }
  }
  return r;
}

const STATUS_OPTIONS = ["PENDING", "STALE", "ACCEPTED", "OVERRIDDEN"] as const;
const BAND_OPTIONS = ["HIGH", "MEDIUM", "LOW"] as const;

const BAND_STYLE: Record<string, string> = {
  HIGH:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW:    "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING:    "bg-gray-100 text-gray-600",
  STALE:      "bg-red-100 text-red-700",
  ACCEPTED:   "bg-emerald-100 text-emerald-700",
  OVERRIDDEN: "bg-blue-100 text-blue-700",
};

export function ColumnTypeReviewClient({ canEdit }: { canEdit: boolean }) {
  const { t } = useLang();
  const c = t.catalog;

  const [status, setStatus] = useState<string>("PENDING");
  const [band, setBand] = useState<string>("");
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [overridingId, setOverridingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      if (band) params.set("band", band);
      const res = await fetch(`/api/classification/suggestions?${params.toString()}`);
      const data = await res.json();
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [status, band, page]);

  useEffect(() => { load(); }, [load]);

  async function accept(attributeId: number) {
    setBusyId(attributeId);
    try {
      await fetch(`/api/classification/attributes/${attributeId}/accept`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reset(attributeId: number) {
    setBusyId(attributeId);
    try {
      await fetch(`/api/classification/attributes/${attributeId}/reset`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function submitOverride(attributeId: number, classCode: "BUSINESS" | "TECHNICAL") {
    if (!reason.trim()) return;
    setBusyId(attributeId);
    try {
      await fetch(`/api/classification/attributes/${attributeId}/override`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_code: classCode, reason: reason.trim() }),
      });
      setOverridingId(null); setReason("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAcceptHigh() {
    setBulkBusy(true);
    try {
      await fetch("/api/classification/attributes/bulk-accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: {} }),
      });
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  const label = (code: string | null) =>
    code === "BUSINESS" ? c.columnTypeBusiness : code === "TECHNICAL" ? c.columnTypeTechnical : "—";

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="text-[12px] border border-line rounded-md px-2 py-1.5"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={band}
            onChange={(e) => { setBand(e.target.value); setPage(1); }}
            className="text-[12px] border border-line rounded-md px-2 py-1.5"
          >
            <option value="">All confidence bands</option>
            {BAND_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <span className="text-[12px] text-muted">{total} suggestion{total !== 1 ? "s" : ""}</span>
        </div>
        {canEdit && (
          <button onClick={bulkAcceptHigh} disabled={bulkBusy} className="btn btn-sm disabled:opacity-50">
            {bulkBusy ? "Accepting…" : "Bulk-accept HIGH confidence"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted text-sm py-10">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted text-sm py-10">No suggestions match this filter.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.attributeId} className="border border-line rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={`/catalog/${r.schemaId}/tables/${r.entityId}`} className="text-[12px] font-semibold text-brand-deep hover:text-brand-purple hover:underline truncate">
                      {r.schemaName}.{r.entityName}
                    </Link>
                    <span className="text-muted text-[12px]">·</span>
                    <span className="text-[12px] font-mono text-ink">{r.physicalName}</span>
                  </div>
                  {r.friendlyName && <div className="text-[11px] text-muted truncate">{r.friendlyName}</div>}
                </div>

                <div className="text-[11px] text-ink-soft shrink-0">
                  current: <strong>{label(r.currentClass)}</strong>
                </div>
                <div className="text-[11px] shrink-0">
                  → suggested: <strong>{label(r.suggestedClass)}</strong>
                </div>
                {r.band && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${BAND_STYLE[r.band]}`}>
                    {r.band} {r.confidence != null ? `(${(Number(r.confidence) * 100).toFixed(0)}%)` : ""}
                  </span>
                )}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {r.status}
                </span>

                <button
                  onClick={() => setExpandedId(expandedId === r.attributeId ? null : r.attributeId)}
                  className="text-[11px] text-muted hover:text-ink shrink-0"
                >
                  {expandedId === r.attributeId ? "Hide rationale" : "Why?"}
                </button>

                {canEdit && (r.status === "PENDING" || r.status === "STALE") && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => accept(r.attributeId)} disabled={busyId === r.attributeId} className="text-[11px] font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                      Accept
                    </button>
                    <button onClick={() => setOverridingId(overridingId === r.attributeId ? null : r.attributeId)} className="text-[11px] font-semibold text-muted hover:text-ink hover:underline">
                      Override
                    </button>
                  </div>
                )}
                {canEdit && (r.status === "ACCEPTED" || r.status === "OVERRIDDEN") && (
                  <button onClick={() => reset(r.attributeId)} disabled={busyId === r.attributeId} className="text-[11px] font-medium text-muted hover:text-ink hover:underline shrink-0">
                    Reset
                  </button>
                )}
              </div>

              {overridingId === r.attributeId && (
                <div className="flex items-center gap-2 px-3 py-2 bg-canvas-soft border-t border-line-soft">
                  <input
                    autoFocus type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder={c.overrideReasonPlaceholder}
                    className="text-[11px] border border-line rounded px-1.5 py-1 flex-1 focus:outline-none focus:border-brand-purple"
                  />
                  <button
                    onClick={() => submitOverride(r.attributeId, r.suggestedClass === "BUSINESS" ? "TECHNICAL" : "BUSINESS")}
                    disabled={busyId === r.attributeId || !reason.trim()}
                    className="text-[11px] font-semibold text-white bg-brand-purple rounded px-2 py-1 disabled:opacity-40"
                  >
                    {c.overrideConfirmBtn} → {label(r.suggestedClass === "BUSINESS" ? "TECHNICAL" : "BUSINESS")}
                  </button>
                  <button onClick={() => { setOverridingId(null); setReason(""); }} className="text-[11px] text-muted hover:text-ink">✕</button>
                </div>
              )}

              {expandedId === r.attributeId && (() => {
                const rationale = parseRationale(r.rationale);
                if (!rationale) return null;
                return (
                  <div className="px-3 py-2 bg-canvas-soft border-t border-line-soft text-[11px] text-ink-soft">
                    <div className="font-semibold mb-1">Terminal rule: {rationale.terminal_rule}</div>
                    <ul className="space-y-0.5 list-disc list-inside">
                      {rationale.hits?.map((h, i) => (
                        <li key={i}><span className="font-mono text-brand-purple">{h.rule}</span> — {h.detail}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-[12px]">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="text-muted hover:text-ink disabled:opacity-30">← Prev</button>
          <span className="text-muted">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="text-muted hover:text-ink disabled:opacity-30">Next →</button>
        </div>
      )}
    </div>
  );
}
