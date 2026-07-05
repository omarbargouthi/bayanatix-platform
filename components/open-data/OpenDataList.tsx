"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OpenDataset, OpenDataStatus } from "@/lib/types";

const STATUS_LABELS: Record<OpenDataStatus, string> = {
  DRAFT:            "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED:         "Approved",
  PUBLISHED:        "Published",
  REJECTED:         "Rejected",
  PENDING:          "Pending Changes",
};

const STATUS_COLORS: Record<OpenDataStatus, string> = {
  DRAFT:            "bg-slate-100 text-slate-600",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED:         "bg-emerald-100 text-emerald-700",
  PUBLISHED:        "bg-brand-purple/10 text-brand-purple",
  REJECTED:         "bg-red-100 text-red-700",
  PENDING:          "bg-sky-100 text-sky-700",
};

const TABS: { key: string; label: string }[] = [
  { key: "all",             label: "All" },
  { key: "DRAFT",           label: "Draft" },
  { key: "PENDING_APPROVAL",label: "Pending Approval" },
  { key: "APPROVED",        label: "Approved" },
  { key: "PUBLISHED",       label: "Published" },
];

type Props = {
  initialDatasets: OpenDataset[];
  initialTotal: number;
  initialStatus: string;
  initialSearch: string;
  initialPage: number;
  canCreate: boolean;
  currentUserId: string;
};

export function OpenDataList({
  initialDatasets,
  initialTotal,
  initialStatus,
  initialSearch,
  initialPage,
  canCreate,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [datasets]  = useState(initialDatasets);
  const [total]     = useState(initialTotal);
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState(initialSearch);
  const [page]      = useState(initialPage);

  const LIMIT = 20;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  async function handleDelete(ds: OpenDataset, e: React.MouseEvent) {
    e.preventDefault();
    const isPublished = ds.statusCode === "PUBLISHED";
    const msg = isPublished
      ? `Retract "${ds.datasetName}" from publication? It will be set back to Pending for revision.`
      : `Delete "${ds.datasetName}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    setDeletingId(ds.datasetId);
    try {
      const res = await fetch(`/api/open-data/datasets/${ds.datasetId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error ?? "Failed to delete dataset");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  function navigate(newStatus?: string, newSearch?: string, newPage?: number) {
    const s = newStatus  ?? status;
    const q = newSearch  ?? search;
    const p = newPage    ?? page;
    const params = new URLSearchParams();
    if (s !== "all") params.set("status", s);
    if (q)           params.set("search", q);
    if (p > 1)       params.set("page", String(p));
    startTransition(() => router.push("/open-data" + (params.size ? "?" + params : "")));
  }

  const refreshFreqLabel: Record<string, string> = {
    MONTHLY:     "Monthly",
    QUARTERLY:   "Quarterly",
    HALF_YEARLY: "Half-yearly",
    YEARLY:      "Yearly",
    ON_DEMAND:   "On Demand",
  };

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Open Data</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage published open datasets and their approval status
          </p>
        </div>
        {canCreate && (
          <Link
            href="/open-data/new"
            className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            New Dataset
          </Link>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); navigate(t.key, search, 1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              status === t.key
                ? "border-brand-purple text-brand-purple"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}

        {/* Search */}
        <div className="ml-auto mb-2">
          <input
            type="text"
            value={search}
            placeholder="Search datasets…"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && navigate(status, search, 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
        </div>
      </div>

      {/* Table */}
      {datasets.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">📂</div>
          <p className="text-sm">No open datasets found.</p>
          {canCreate && (
            <Link href="/open-data/new" className="mt-4 inline-block text-sm text-brand-purple hover:underline">
              Create the first dataset →
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Grid header */}
            <div
              className="grid text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 bg-slate-50 border-b border-slate-200"
              style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto" }}
            >
              <span>Dataset</span>
              <span>Category</span>
              <span>Format</span>
              <span>Refresh</span>
              <span>Columns</span>
              <span>Status</span>
              <span></span>
            </div>

            {datasets.map((ds) => {
              const canDelete = ds.raisedByUserId === currentUserId;
              const isPublished = ds.statusCode === "PUBLISHED";
              const isDraft = ds.statusCode === "DRAFT" || ds.statusCode === "PENDING";
              return (
              <div
                key={ds.datasetId}
                className="grid items-center px-4 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto" }}
              >
                <Link href={`/open-data/${ds.datasetId}`} className="contents">
                {/* Name + description */}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{ds.datasetName}</p>
                  {ds.descriptionText && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{ds.descriptionText}</p>
                  )}
                  {ds.hasPii && (
                    <span className="mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">
                      PII
                    </span>
                  )}
                </div>

                {/* Category */}
                <span className="text-sm text-slate-600 truncate pr-2">
                  {ds.categoryText ?? "—"}
                </span>

                {/* Format */}
                <span className="text-sm text-slate-600">
                  {ds.dataFormats.length > 0
                    ? ds.dataFormats.join(", ").toUpperCase()
                    : "—"}
                </span>

                {/* Refresh */}
                <span className="text-sm text-slate-600">
                  {ds.refreshFrequency ? refreshFreqLabel[ds.refreshFrequency] ?? ds.refreshFrequency : "—"}
                </span>

                {/* Column count */}
                <span className="text-sm text-slate-600">{ds.columnCount}</span>

                {/* Status badge */}
                <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[ds.statusCode as OpenDataStatus]}`}>
                  {STATUS_LABELS[ds.statusCode as OpenDataStatus] ?? ds.statusCode}
                </span>
                </Link>

                {/* Delete / Retract action */}
                <div className="pl-2">
                  {canDelete && (isDraft || isPublished) && (
                    <button
                      onClick={(e) => handleDelete(ds, e)}
                      disabled={deletingId === ds.datasetId}
                      title={isPublished ? "Retract from publication" : "Delete dataset"}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        isPublished
                          ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                          : "border-red-100 text-red-400 hover:bg-red-50"
                      } disabled:opacity-40`}
                    >
                      {deletingId === ds.datasetId ? "…" : isPublished ? "Retract" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
              <span>{total} datasets total</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => navigate(status, search, page - 1)}
                  className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  ← Prev
                </button>
                <span>Page {page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => navigate(status, search, page + 1)}
                  className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
