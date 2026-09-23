"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { SourceSystemSelect } from "./SourceSystemSelect";

type SuggestionRow = {
  entityId: number;
  entityName: string;
  schemaId: number;
  schemaName: string;
  dataSourceId: number;
  sourceName: string;
  category: string | null;
  categoryConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  categoryIsConfirmed: boolean;
  rowCount: number | null;
};

const CATEGORY_OPTIONS = [
  { value: "MASTER",        labelKey: "typeMaster" as const },
  { value: "TRANSACTIONAL", labelKey: "typeTransactional" as const },
  { value: "REFERENCE",     labelKey: "typeReference" as const },
  { value: "SETUP",         labelKey: "typeSetup" as const },
  { value: "SYSTEM",        labelKey: "typeSystem" as const },
];

const CONFIDENCE_STYLE: Record<string, string> = {
  HIGH:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW:    "bg-red-50 text-red-700 border-red-200",
};

// Table-level counterpart to ColumnTypeReviewClient.tsx — reviews the crawler's
// Master/Transactional/Reference/Setup/System suggestions in one list instead of
// having to open each table individually. Uses the same confirm-category endpoint
// the per-table TableTypeBadge Accept/Change actions already call.
export function TableTypeReviewClient({ canEdit }: { canEdit: boolean }) {
  const { t } = useLang();
  const c = t.catalog;

  const [confirmed, setConfirmed] = useState<"false" | "true" | "">("false");
  const [dataSourceId, setDataSourceId] = useState("");
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [changingId, setChangingId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setChecked(new Set());
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (confirmed) params.set("confirmed", confirmed);
      if (dataSourceId) params.set("dataSourceId", dataSourceId);
      const res = await fetch(`/api/catalog/entities/category-suggestions?${params.toString()}`);
      const data = await res.json();
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [confirmed, dataSourceId, page]);

  useEffect(() => { void load(); }, [load]);

  function toggle(id: number) {
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // Only unconfirmed rows carry a checkbox (see the row render below) — "select
  // all" must mirror that exact eligibility, not every row currently on the page.
  const selectableIds = rows.filter((r) => !r.categoryIsConfirmed).map((r) => r.entityId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => checked.has(id));
  function toggleSelectAll() {
    setChecked((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  const labelFor = (code: string | null) => {
    const opt = CATEGORY_OPTIONS.find(o => o.value === code);
    return opt ? c[opt.labelKey] : (code ?? "—");
  };

  const confidenceLabel = (band: SuggestionRow["categoryConfidence"]) =>
    band === "HIGH" ? c.confidenceHigh : band === "MEDIUM" ? c.confidenceMedium : c.confidenceLow;

  async function confirm(entityId: number, category: string | null) {
    setBusyId(entityId);
    try {
      await fetch(`/api/catalog/entities/${entityId}/confirm-category`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      setChangingId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAccept() {
    if (checked.size === 0) return;
    setBulkBusy(true);
    try {
      await fetch("/api/catalog/entities/bulk-confirm-category", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_ids: [...checked] }),
      });
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
            value={confirmed}
            onChange={(e) => { setConfirmed(e.target.value as "false" | "true" | ""); setPage(1); }}
            className="text-[12px] border border-line rounded-md px-2 py-1.5"
          >
            <option value="false">Pending review</option>
            <option value="true">Confirmed</option>
            <option value="">All</option>
          </select>
          <SourceSystemSelect value={dataSourceId} onChange={(v) => { setDataSourceId(v); setPage(1); }} />
          <span className="text-[12px] text-muted">{total} table{total !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && selectableIds.length > 0 && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer select-none">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-3.5 h-3.5 accent-brand-purple" />
              {allSelected ? "Unselect all" : "Select all"}
            </label>
          )}
          {canEdit && checked.size > 0 && (
            <button onClick={bulkAccept} disabled={bulkBusy} className="btn btn-sm disabled:opacity-50">
              {bulkBusy ? "…" : `Bulk accept (${checked.size})`}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted text-sm py-10">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted text-sm py-10">No tables match this filter.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.entityId} className="border border-line rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                {canEdit && !r.categoryIsConfirmed && (
                  <input type="checkbox" checked={checked.has(r.entityId)} onChange={() => toggle(r.entityId)} className="w-3.5 h-3.5 accent-brand-purple shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/catalog/${r.schemaId}/tables/${r.entityId}`} className="text-[12px] font-semibold text-brand-deep hover:text-brand-purple hover:underline">
                    {r.schemaName}.{r.entityName}
                  </Link>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-muted ml-2">{r.sourceName}</span>
                  {r.rowCount != null && (
                    <span className="text-[11px] text-muted ml-2">{r.rowCount.toLocaleString()} rows</span>
                  )}
                </div>

                {r.categoryIsConfirmed ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple shrink-0">
                    {labelFor(r.category)}
                  </span>
                ) : (
                  <>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-amber-400 bg-amber-50 text-amber-700 shrink-0"
                      title={confidenceLabel(r.categoryConfidence)}
                    >
                      {c.suggestedTypePrefix} {labelFor(r.category)}
                    </span>
                    {r.categoryConfidence && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${CONFIDENCE_STYLE[r.categoryConfidence]}`}>
                        {r.categoryConfidence}
                      </span>
                    )}
                  </>
                )}

                {canEdit && changingId === r.entityId ? (
                  <select
                    autoFocus
                    disabled={busyId === r.entityId}
                    defaultValue={r.category ?? ""}
                    onChange={(e) => confirm(r.entityId, e.target.value || null)}
                    onBlur={() => setChangingId(null)}
                    className="text-xs border border-line rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-brand-purple shrink-0"
                  >
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{c[o.labelKey]}</option>)}
                  </select>
                ) : canEdit && !r.categoryIsConfirmed ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => confirm(r.entityId, r.category)}
                      disabled={busyId === r.entityId}
                      className="text-[11px] font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      {c.acceptSuggestion}
                    </button>
                    <button
                      onClick={() => setChangingId(r.entityId)}
                      className="text-[11px] font-medium text-muted hover:text-ink hover:underline"
                    >
                      {c.changeSuggestion}
                    </button>
                  </div>
                ) : canEdit && r.categoryIsConfirmed ? (
                  <button
                    onClick={() => setChangingId(r.entityId)}
                    className="text-[11px] font-medium text-muted hover:text-ink hover:underline shrink-0"
                  >
                    {c.changeSuggestion}
                  </button>
                ) : null}
              </div>
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
