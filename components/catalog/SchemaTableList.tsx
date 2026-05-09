"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DataEntity } from "@/lib/types";
import { CertTag, Tag } from "@/components/ui/Tag";
import { AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  IconTable,
  IconHistory,
  IconCollaborate,
  IconChevron,
  IconSearch,
} from "@/components/layout/icons";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { TagPicker } from "./TagPicker";
import { TermMultiPicker } from "./TermMultiPicker";
import { StarRatingWidget } from "./StarRatingWidget";
import { CertifyAssetModal } from "./CertifyAssetModal";
import { AssetRequestsDrawer } from "./AssetRequestsDrawer";
import { fmtNumber } from "@/lib/utils";

// Compact star display for list view (read-only, no API call — uses pre-fetched data)
function StarDisplay({ avg, count }: { avg: number | null | undefined; count: number | undefined }) {
  if (!avg || !count) return <span className="text-muted text-[11px]">—</span>;
  const full = Math.round(avg);
  return (
    <div>
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map((n) => (
          <span key={n} className={`text-[14px] leading-none ${n <= full ? "text-amber-400" : "text-gray-200"}`}>★</span>
        ))}
      </div>
      <div className="text-[10px] text-muted mt-0.5">{Number(avg).toFixed(1)} ({count})</div>
    </div>
  );
}

function changePct(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted text-[11px]">—</span>;
  const up = pct >= 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? "↑" : "↓"}{Math.abs(pct)}%
    </span>
  );
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  TRANSACTIONAL: "Transactional",
  MASTER:        "Master",
  REFERENCE:     "Lookup / Reference",
  SYSTEM:        "System / Setup",
};

const ENTITY_TYPE_OPTIONS = [
  { value: "",              label: "— None —" },
  { value: "TRANSACTIONAL", label: "Transactional" },
  { value: "MASTER",        label: "Master" },
  { value: "REFERENCE",     label: "Lookup / Reference" },
  { value: "SYSTEM",        label: "System / Setup" },
];

const FILTER_TYPE_OPTIONS = [
  { value: "",              label: "All Types" },
  { value: "TRANSACTIONAL", label: "Transactional" },
  { value: "MASTER",        label: "Master" },
  { value: "REFERENCE",     label: "Lookup / Reference" },
  { value: "SYSTEM",        label: "System / Setup" },
];

const CERT_OPTIONS = [
  { value: "",       label: "All Status" },
  { value: "GOLD",   label: "Gold" },
  { value: "SILVER", label: "Silver" },
  { value: "BRONZE", label: "Bronze" },
];

// ─── Property row inside the expanded panel ────────────────────────────────────

function PropRow({
  label,
  children,
  automated,
}: {
  label:     string;
  children:  React.ReactNode;
  automated?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-line-soft last:border-0">
      <dt className="w-28 shrink-0 text-[11px] uppercase tracking-wider text-muted pt-0.5 flex items-center gap-1">
        {label}
        {automated && (
          <span className="text-[9px] bg-canvas border border-line rounded px-1 text-muted normal-case tracking-normal">auto</span>
        )}
      </dt>
      <dd className="flex-1 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

// ─── Edit modal ────────────────────────────────────────────────────────────────

function TableEditModal({
  entity,
  onClose,
}: {
  entity:  DataEntity;
  onClose: () => void;
}) {
  const router  = useRouter();
  const [dispName, setDispName] = useState(entity.displayName ?? "");
  const [desc,     setDesc]     = useState(entity.description ?? "");
  const [cat,      setCat]      = useState(entity.category    ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/catalog/entities/${entity.entityId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description: desc, displayName: dispName, category: cat || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save");
        return;
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="font-bold text-brand-deep">Edit Table Metadata</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5">{entity.entityName}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        {/* Read-only notice */}
        <div className="mx-6 mt-4 px-3 py-2 bg-canvas rounded-md border border-line-soft flex items-center gap-2 text-[12px] text-muted">
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <span><strong>Asset Name</strong> and <strong>Usage attributes</strong> (row count, column count, trust score) are system-managed and cannot be edited.</span>
        </div>

        {/* Editable fields */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="field-label">Friendly Name</label>
            <input
              type="text"
              value={dispName}
              onChange={(e) => setDispName(e.target.value)}
              className="input-field"
              placeholder="Business-friendly name for this table…"
              autoFocus
            />
            <p className="text-[11px] text-muted mt-1">Shown alongside the physical name in catalog views.</p>
          </div>

          <div>
            <label className="field-label">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              className="input-field resize-none"
              placeholder="What does this table store? Who uses it and for what purpose?"
            />
          </div>

          <div>
            <label className="field-label">Table Type</label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="input-field">
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Tags</label>
            <TagPicker assetType="DATA_ENTITIES" assetId={entity.entityId} />
          </div>

          <div>
            <label className="field-label">Business Terms</label>
            <TermMultiPicker assetType="DATA_ENTITIES" assetId={entity.entityId} />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function SchemaTableList({
  entities,
  schemaId,
  canEdit,
}: {
  entities: DataEntity[];
  schemaId: number;
  canEdit:  boolean;
}) {
  const [search,        setSearch]        = useState("");
  const [filterType,    setFilterType]    = useState("");
  const [filterCert,    setFilterCert]    = useState("");
  const [expandedIds,   setExpandedIds]   = useState<Set<number>>(new Set());
  const [editingEntity,  setEditingEntity]  = useState<DataEntity | null>(null);
  const [historyEntity,  setHistoryEntity]  = useState<DataEntity | null>(null);
  const [certifyEntity,  setCertifyEntity]  = useState<DataEntity | null>(null);
  const [requestsEntity, setRequestsEntity] = useState<DataEntity | null>(null);

  const tables = useMemo(() => entities.filter((e) => !e.isView), [entities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables.filter((e) => {
      if (q && !e.entityName.toLowerCase().includes(q) && !(e.description ?? "").toLowerCase().includes(q)) return false;
      if (filterType && e.category !== filterType) return false;
      if (filterCert && e.certCode !== filterCert) return false;
      return true;
    });
  }, [tables, search, filterType, filterCert]);

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* ── Search + filter bar ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm">
          <IconSearch className="w-3.5 h-3.5 text-muted shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables by name or description…"
            className="bg-transparent outline-none border-0 text-sm flex-1 placeholder-muted"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple"
        >
          {FILTER_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={filterCert}
          onChange={(e) => setFilterCert(e.target.value)}
          className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple"
        >
          {CERT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <span className="text-sm text-muted ml-auto">
          <strong className="text-ink">{filtered.length}</strong> of {tables.length} tables
        </span>
      </div>

      {/* ── Table list ── */}
      <div className="card overflow-hidden">
        {/* Column header */}
        <div className="grid grid-cols-[32px_2fr_1fr_160px_140px_88px_90px] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
          <div />
          <div>Asset Name</div>
          <div>Type</div>
          <div>Certification</div>
          <div>Stewards</div>
          <div>Trust</div>
          <div>Rating</div>
        </div>

        {filtered.length === 0 && (
          <div className="py-14 text-center text-muted text-sm">
            <IconTable className="w-10 h-10 mx-auto mb-3 opacity-20" />
            No tables match your filters.
          </div>
        )}

        {filtered.map((entity) => {
          const isExpanded = expandedIds.has(entity.entityId);
          const trust = entity.trustScore != null ? Math.round(Number(entity.trustScore)) : null;

          return (
            <div key={entity.entityId} className="border-b border-line-soft last:border-b-0">

              {/* ── Summary row ── */}
              <div
                className="grid grid-cols-[32px_2fr_1fr_160px_140px_88px_90px] gap-3 px-5 py-3.5 items-center hover:bg-canvas-soft transition-colors cursor-pointer"
                onClick={() => toggleExpand(entity.entityId)}
              >
                {/* Chevron */}
                <div className="flex justify-center">
                  <IconChevron
                    className={`w-3.5 h-3.5 text-muted transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`}
                  />
                </div>

                {/* Name + icon actions */}
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <IconTable className="w-4 h-4 text-brand-purple shrink-0" />
                    <Link
                      href={`/catalog/${schemaId}/tables/${entity.entityId}`}
                      className="font-semibold text-brand-deep hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entity.entityName}
                    </Link>
                    {entity.displayName && (
                      <span className="text-muted text-[11px] truncate max-w-[120px]">({entity.displayName})</span>
                    )}
                    {(entity.totalWarnings ?? 0) > 0 && (
                      <button
                        title={`${entity.totalWarnings} open request${entity.totalWarnings !== 1 ? "s" : ""} — click to view`}
                        onClick={(e) => { e.stopPropagation(); setRequestsEntity(entity); }}
                        className={`flex items-center gap-0.5 text-[11px] font-bold leading-none hover:opacity-70 transition-opacity ${
                          (entity.topRequestPriority ?? entity.topSeverity) === "HIGH"   ? "text-red-600"   :
                          (entity.topRequestPriority ?? entity.topSeverity) === "MEDIUM" ? "text-amber-500" : "text-yellow-500"
                        }`}
                      >
                        ⚠ {entity.totalWarnings}
                      </button>
                    )}
                  </div>
                  {/* Icon actions row */}
                  <div className="flex items-center gap-0.5 mt-1.5">
                    {canEdit && (
                      <button
                        onClick={() => setEditingEntity(entity)}
                        className="w-6 h-6 grid place-items-center rounded text-muted hover:text-brand-purple hover:bg-brand-purple/10 transition-colors"
                        title="Edit metadata"
                      >
                        <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setCertifyEntity(entity)}
                        className="w-6 h-6 grid place-items-center rounded text-muted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Certify asset"
                      >
                        <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => setHistoryEntity(entity)}
                      className="w-6 h-6 grid place-items-center rounded text-muted hover:text-brand-purple hover:bg-brand-purple/10 transition-colors"
                      title="Change history"
                    >
                      <IconHistory className="w-3 h-3" />
                    </button>
                    <Link
                      href={`/collaboration?newTitle=${encodeURIComponent(`Discussion: ${entity.entityName}`)}`}
                      className="w-6 h-6 grid place-items-center rounded text-muted hover:text-brand-purple hover:bg-brand-purple/10 transition-colors"
                      title="Start collaboration thread"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconCollaborate className="w-3 h-3" />
                    </Link>
                    <button
                      onClick={() => setRequestsEntity(entity)}
                      className="w-6 h-6 grid place-items-center rounded text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="View / raise requests"
                    >
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  {entity.category
                    ? <Tag variant="purple">{ENTITY_TYPE_LABEL[entity.category] ?? entity.category}</Tag>
                    : <span className="text-muted text-[12px]">—</span>}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase tracking-wider text-muted w-6 shrink-0">M</span>
                    <CertTag code={entity.certCode} />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase tracking-wider text-muted w-6 shrink-0">D</span>
                    <CertTag code={entity.dataCertCode} />
                  </div>
                </div>

                <div><AvatarStack users={entity.stewards ?? []} /></div>

                <div>
                  {trust != null ? (
                    <>
                      <div className="font-bold text-brand-deep text-sm">{trust}%</div>
                      <div className="mt-1"><ProgressBar value={trust} height={4} /></div>
                    </>
                  ) : <span className="text-muted">—</span>}
                </div>

                <div>
                  <StarDisplay avg={entity.avgRating} count={entity.ratingCount} />
                </div>
              </div>

              {/* ── Expanded detail panel ── */}
              {isExpanded && (
                <div className="px-12 pt-4 pb-5 bg-canvas-soft/50 border-t border-line-soft">
                  <div className="grid grid-cols-[1fr_260px] gap-6">

                    {/* Left: description + DQ */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Description</h4>
                      {entity.description ? (
                        <p className="text-[13px] text-ink leading-relaxed mb-4">{entity.description}</p>
                      ) : (
                        <p className="text-[13px] text-muted italic mb-4">
                          No description provided.{canEdit ? " Click the edit icon above to add one." : ""}
                        </p>
                      )}

                      {/* Mini DQ grid */}
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Quality Indicators</h4>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {([
                          { label: "Trust Score",   value: trust != null ? `${trust}%` : "—" },
                          { label: "Completeness",  value: "—" },
                          { label: "Validity",      value: "—" },
                        ] as { label: string; value: string }[]).map(({ label, value }) => (
                          <div key={label} className="bg-white border border-line rounded-lg px-3 py-2.5">
                            <div className="text-sm font-bold text-ink">{value}</div>
                            <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Usage metrics */}
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Usage Metrics · 30 days</h4>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {([
                          {
                            label: "Queries",
                            value: entity.queries30d != null ? fmtNumber(entity.queries30d) : "—",
                            pct:   changePct(entity.queries30d, entity.queryPrev30d),
                          },
                          {
                            label: "Unique Users",
                            value: entity.uniqueUsers != null ? String(entity.uniqueUsers) : "—",
                            pct:   changePct(entity.uniqueUsers, entity.uniqueUsersPrev),
                          },
                          {
                            label: "Avg Query (ms)",
                            value: entity.avgQueryMs != null ? fmtNumber(Math.round(entity.avgQueryMs)) : "—",
                            pct:   changePct(entity.avgQueryMs, entity.avgQueryMsPrev),
                          },
                        ]).map(({ label, value, pct }) => (
                          <div key={label} className="bg-white border border-line rounded-lg px-3 py-2.5">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-bold text-ink">{value}</span>
                              <DeltaBadge pct={pct} />
                            </div>
                            <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Incident scale */}
                      {(entity.openIncidentCount ?? 0) > 0 && (
                        <>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Incident Scale</h4>
                          <div className="bg-white border border-line rounded-lg px-3 py-2.5 mb-4 space-y-1.5">
                            {([
                              { label: "High",   count: entity.highIncidents   ?? 0, color: "bg-red-500"   },
                              { label: "Medium", count: entity.mediumIncidents ?? 0, color: "bg-amber-400" },
                              { label: "Low",    count: entity.lowIncidents    ?? 0, color: "bg-yellow-400" },
                            ] as { label: string; count: number; color: string }[]).map(({ label, count, color }) => {
                              const total = (entity.openIncidentCount ?? 1);
                              const pct   = Math.round((count / total) * 100);
                              return (
                                <div key={label} className="flex items-center gap-2">
                                  <span className="w-10 text-[11px] text-muted">{label}</span>
                                  <div className="flex-1 h-1.5 rounded-full bg-canvas overflow-hidden">
                                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[11px] font-semibold text-ink w-4 text-right">{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {/* Tags */}
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Tags</h4>
                      <div className="mb-4">
                        <TagPicker assetType="DATA_ENTITIES" assetId={entity.entityId} />
                      </div>

                      {/* Business Terms */}
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Business Terms</h4>
                      <div className="mb-4">
                        <TermMultiPicker assetType="DATA_ENTITIES" assetId={entity.entityId} />
                      </div>

                      {/* Rating */}
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Asset Rating</h4>
                      <div className="bg-white border border-line rounded-lg px-4 py-3 mb-4">
                        <StarRatingWidget assetType="DATA_ENTITIES" assetId={entity.entityId} />
                      </div>

                      <Link
                        href={`/catalog/${schemaId}/tables/${entity.entityId}`}
                        className="btn btn-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View full table →
                      </Link>
                    </div>

                    {/* Right: properties panel */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">Properties</h4>
                      <div className="bg-white border border-line rounded-lg px-4 py-1">
                        <dl>
                          {/* Editable metadata */}
                          <PropRow label="Physical Name">
                            <span className="font-mono text-[12px]">{entity.entityName}</span>
                          </PropRow>
                          <PropRow label="Friendly Name">
                            {entity.displayName
                              ? <span>{entity.displayName}</span>
                              : <span className="text-muted italic">—</span>}
                          </PropRow>
                          <PropRow label="Type">
                            {entity.category
                              ? <Tag variant="purple">{ENTITY_TYPE_LABEL[entity.category] ?? entity.category}</Tag>
                              : <span className="text-muted">—</span>}
                          </PropRow>
                          <PropRow label="Metadata Cert">
                            <div className="flex items-center gap-1.5">
                              <CertTag code={entity.certCode} />
                              {canEdit && (
                                <button
                                  onClick={() => setCertifyEntity(entity)}
                                  className="text-[10px] text-brand-purple hover:underline"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </PropRow>
                          <PropRow label="Data Cert">
                            <CertTag code={entity.dataCertCode} />
                          </PropRow>
                          <PropRow label="Stewards">
                            {(entity.stewards ?? []).length > 0
                              ? <AvatarStack users={entity.stewards ?? []} />
                              : <span className="text-muted">—</span>}
                          </PropRow>

                          {/* Divider: Usage (automated) */}
                          <div className="py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-line-soft" />
                              <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Usage · automated</span>
                              <div className="flex-1 h-px bg-line-soft" />
                            </div>
                          </div>

                          <PropRow label="Row Count" automated>
                            <span className="font-mono text-[12px]">{fmtNumber(entity.rowCount as number | null)}</span>
                          </PropRow>
                          <PropRow label="Columns" automated>
                            <span className="font-mono text-[12px]">{entity.columnCount ?? "—"}</span>
                          </PropRow>
                          <PropRow label="Trust Score" automated>
                            {trust != null ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-brand-deep text-[12px]">{trust}%</span>
                                <div className="flex-1 max-w-[60px]"><ProgressBar value={trust} height={4} /></div>
                              </div>
                            ) : <span className="text-muted">—</span>}
                          </PropRow>
                          <PropRow label="Asset Kind" automated>
                            <span className="text-[12px]">{entity.isView ? "View" : "Table"}</span>
                          </PropRow>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Portals */}
      {editingEntity && (
        <TableEditModal entity={editingEntity} onClose={() => setEditingEntity(null)} />
      )}
      {historyEntity && (
        <AssetHistoryDrawer
          assetType="DATA_ENTITIES"
          assetId={historyEntity.entityId}
          assetName={historyEntity.entityName}
          onClose={() => setHistoryEntity(null)}
        />
      )}
      {certifyEntity && (
        <CertifyAssetModal
          assetType="DATA_ENTITIES"
          assetId={certifyEntity.entityId}
          assetName={certifyEntity.entityName}
          onClose={() => setCertifyEntity(null)}
        />
      )}
      {requestsEntity && (
        <AssetRequestsDrawer
          assetType="DATA_ENTITIES"
          assetId={requestsEntity.entityId}
          assetName={requestsEntity.entityName}
          entities={entities.map((e) => ({ entityId: e.entityId, entityName: e.entityName }))}
          onClose={() => setRequestsEntity(null)}
        />
      )}
    </>
  );
}
