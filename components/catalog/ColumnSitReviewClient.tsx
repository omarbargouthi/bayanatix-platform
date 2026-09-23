"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SourceSystemSelect } from "./SourceSystemSelect";

type SitSuggestionRow = {
  attributeId: number;
  physicalName: string;
  friendlyName: string | null;
  entityId: number;
  entityName: string;
  schemaId: number;
  schemaName: string;
  dataSourceId: number;
  sourceName: string;
  suggestedGlossaryId: number | null;
  suggestedTermName: string | null;
  confidence: number | null;
  band: "HIGH" | "MEDIUM" | "LOW" | null;
  status: string;
  rationale: unknown;
  currentGlossaryId: number | null;
  currentTermName: string | null;
};

type SitTermOption = { glossaryId: number; termName: string; classificationCode: string | null; patternCount: number };

function parseRationale(r: unknown): { hits?: { patternType: string; patternText: string; matchRatio: number; contribution: number }[]; note?: string; sampled_live?: boolean } | null {
  if (!r) return null;
  if (typeof r === "string") {
    try { return JSON.parse(r); } catch { return null; }
  }
  return r as ReturnType<typeof parseRationale>;
}

const STATUS_OPTIONS = ["PENDING", "STALE", "ACCEPTED", "REJECTED"] as const;
const BAND_OPTIONS = ["HIGH", "MEDIUM", "LOW"] as const;

const BAND_STYLE: Record<string, string> = {
  HIGH:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW:    "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING:  "bg-gray-100 text-gray-600",
  STALE:    "bg-red-100 text-red-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-blue-100 text-blue-700",
};

// Review queue for Sensitive Information Type suggestions. Structural twin of
// ColumnTypeReviewClient.tsx (list/paginate/filter/checkbox/bulk-accept shell
// reused verbatim) — the difference is entirely in what "resolving" a row means:
// Accept/Reassign both link the column to a business-glossary term (and copy its
// classification down), Reject is a sticky "not sensitive" call, not a toggle to
// an alternate fixed value.
export function ColumnSitReviewClient({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<string>("PENDING");
  const [band, setBand] = useState<string>("");
  const [dataSourceId, setDataSourceId] = useState("");
  const [rows, setRows] = useState<SitSuggestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveMode, setResolveMode] = useState<"reject" | "reassign">("reject");
  const [reassignTo, setReassignTo] = useState<string>("");
  const [reason, setReason] = useState("");
  const [terms, setTerms] = useState<SitTermOption[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setChecked(new Set());
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      if (band) params.set("band", band);
      if (dataSourceId) params.set("dataSourceId", dataSourceId);
      const res = await fetch(`/api/classification/sit-suggestions?${params.toString()}`);
      const data = await res.json();
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [status, band, dataSourceId, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/sit/terms").then((r) => r.json()).then(setTerms).catch(() => {});
  }, []);

  function toggle(id: number) {
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // Only PENDING/STALE rows carry a checkbox at all (see the row render below) —
  // "select all" must mirror that exact eligibility, not every row on the page.
  const selectableIds = rows.filter((r) => r.status === "PENDING" || r.status === "STALE").map((r) => r.attributeId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => checked.has(id));
  function toggleSelectAll() {
    setChecked((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  async function accept(attributeId: number) {
    setBusyId(attributeId);
    try {
      await fetch(`/api/classification/sit-attributes/${attributeId}/accept`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function openResolve(attributeId: number, mode: "reject" | "reassign") {
    setResolvingId(resolvingId === attributeId && resolveMode === mode ? null : attributeId);
    setResolveMode(mode);
    setReassignTo("");
    setReason("");
  }

  async function submitResolve(attributeId: number) {
    if (!reason.trim()) return;
    if (resolveMode === "reassign" && !reassignTo) return;
    setBusyId(attributeId);
    try {
      if (resolveMode === "reject") {
        await fetch(`/api/classification/sit-attributes/${attributeId}/reject`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        });
      } else {
        await fetch(`/api/classification/sit-attributes/${attributeId}/reassign`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ glossary_id: Number(reassignTo), reason: reason.trim() }),
        });
      }
      setResolvingId(null); setReason(""); setReassignTo("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAccept() {
    if (checked.size === 0) return;
    setBulkBusy(true);
    try {
      await fetch("/api/classification/sit-attributes/bulk-accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attribute_ids: [...checked] }),
      });
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  // No bulk-reject endpoint exists — reject is a per-row action requiring a
  // reason (see submitResolve above), so this applies one shared reason across
  // every selected row via the same single-item endpoint.
  async function bulkReject() {
    if (checked.size === 0 || !bulkReason.trim()) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...checked].map((id) =>
          fetch(`/api/classification/sit-attributes/${id}/reject`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: bulkReason.trim() }),
          })
        )
      );
      setBulkRejecting(false); setBulkReason("");
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

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
          <SourceSystemSelect value={dataSourceId} onChange={(v) => { setDataSourceId(v); setPage(1); }} />
          <span className="text-[12px] text-muted">{total} suggestion{total !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && selectableIds.length > 0 && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer select-none">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-3.5 h-3.5 accent-brand-purple" />
              {allSelected ? "Unselect all" : "Select all"}
            </label>
          )}
          {canEdit && checked.size > 0 && (
            <>
              <button onClick={bulkAccept} disabled={bulkBusy} className="btn btn-sm disabled:opacity-50">
                {bulkBusy ? "…" : `Bulk accept (${checked.size})`}
              </button>
              <button onClick={() => setBulkRejecting((v) => !v)} disabled={bulkBusy} className="text-[12px] font-semibold text-red-600 hover:underline disabled:opacity-50 px-2">
                {`Bulk reject (${checked.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {bulkRejecting && checked.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-canvas-soft border border-line-soft rounded-lg flex-wrap">
          <input
            autoFocus type="text" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}
            placeholder={`Why aren't these ${checked.size} sensitive? (applied to all selected)`}
            className="text-[11px] border border-line rounded px-1.5 py-1 flex-1 min-w-[220px] focus:outline-none focus:border-brand-purple"
          />
          <button
            onClick={bulkReject}
            disabled={bulkBusy || !bulkReason.trim()}
            className="text-[11px] font-semibold text-white bg-red-600 rounded px-2 py-1 disabled:opacity-40"
          >
            {bulkBusy ? "…" : `Confirm Reject (${checked.size})`}
          </button>
          <button onClick={() => { setBulkRejecting(false); setBulkReason(""); }} className="text-[11px] text-muted hover:text-ink">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted text-sm py-10">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted text-sm py-10">No suggestions match this filter.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.attributeId} className="border border-line rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5">
                {canEdit && (r.status === "PENDING" || r.status === "STALE") && (
                  <input type="checkbox" checked={checked.has(r.attributeId)} onChange={() => toggle(r.attributeId)} className="w-3.5 h-3.5 accent-brand-purple shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={`/catalog/${r.schemaId}/tables/${r.entityId}`} className="text-[12px] font-semibold text-brand-deep hover:text-brand-purple hover:underline truncate">
                      {r.schemaName}.{r.entityName}
                    </Link>
                    <span className="text-muted text-[12px]">·</span>
                    <span className="text-[12px] font-mono text-ink">{r.physicalName}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-muted">{r.sourceName}</span>
                  </div>
                  {r.friendlyName && <div className="text-[11px] text-muted truncate">{r.friendlyName}</div>}
                </div>

                <div className="text-[11px] text-ink-soft shrink-0">
                  current: <strong>{r.currentTermName ?? "—"}</strong>
                </div>
                <div className="text-[11px] shrink-0">
                  → suggested: <strong>{r.suggestedTermName ?? "—"}</strong>
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
                  {expandedId === r.attributeId ? "Hide evidence" : "Why?"}
                </button>

                {canEdit && (r.status === "PENDING" || r.status === "STALE") && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => accept(r.attributeId)} disabled={busyId === r.attributeId} className="text-[11px] font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                      Accept
                    </button>
                    <button onClick={() => openResolve(r.attributeId, "reassign")} className="text-[11px] font-semibold text-muted hover:text-ink hover:underline">
                      Reassign
                    </button>
                    <button onClick={() => openResolve(r.attributeId, "reject")} className="text-[11px] font-semibold text-muted hover:text-ink hover:underline">
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {resolvingId === r.attributeId && (
                <div className="flex items-center gap-2 px-3 py-2 bg-canvas-soft border-t border-line-soft flex-wrap">
                  {resolveMode === "reassign" && (
                    <select
                      value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}
                      className="text-[11px] border border-line rounded px-1.5 py-1 focus:outline-none focus:border-brand-purple"
                    >
                      <option value="">Select the correct SIT term…</option>
                      {terms.map((t) => <option key={t.glossaryId} value={t.glossaryId}>{t.termName}</option>)}
                    </select>
                  )}
                  <input
                    autoFocus type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder={resolveMode === "reject" ? "Why isn't this sensitive?" : "Why is this the correct term?"}
                    className="text-[11px] border border-line rounded px-1.5 py-1 flex-1 min-w-[160px] focus:outline-none focus:border-brand-purple"
                  />
                  <button
                    onClick={() => submitResolve(r.attributeId)}
                    disabled={busyId === r.attributeId || !reason.trim() || (resolveMode === "reassign" && !reassignTo)}
                    className="text-[11px] font-semibold text-white bg-brand-purple rounded px-2 py-1 disabled:opacity-40"
                  >
                    {resolveMode === "reject" ? "Confirm Reject" : "Confirm Reassign"}
                  </button>
                  <button onClick={() => { setResolvingId(null); setReason(""); setReassignTo(""); }} className="text-[11px] text-muted hover:text-ink">✕</button>
                </div>
              )}

              {expandedId === r.attributeId && (() => {
                const rationale = parseRationale(r.rationale);
                if (!rationale) return null;
                return (
                  <div className="px-3 py-2 bg-canvas-soft border-t border-line-soft text-[11px] text-ink-soft">
                    <div className="font-semibold mb-1">
                      {rationale.sampled_live ? "Scored against live sampled values" : "No live connection — name-based signals only"}
                    </div>
                    {rationale.note && <div>{rationale.note}</div>}
                    {rationale.hits && rationale.hits.length > 0 && (
                      <ul className="space-y-0.5 list-disc list-inside">
                        {rationale.hits.map((h, i) => (
                          <li key={i}>
                            <span className="font-mono text-brand-purple">{h.patternType}</span> <span className="font-mono">{h.patternText}</span>
                            {" — "}{(h.matchRatio * 100).toFixed(0)}% match, contributed {(h.contribution * 100).toFixed(0)}%
                          </li>
                        ))}
                      </ul>
                    )}
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
