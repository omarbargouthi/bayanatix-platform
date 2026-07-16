"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ClassificationTag } from "@/components/ui/Tag";
import type { ClassificationStats } from "@/lib/queries/catalog";
import type { ClassificationColumn } from "@/app/api/classification/columns/route";
import type { GlossaryPickerDomain } from "@/app/api/glossary/picker/route";
import { useLang } from "@/lib/lang-context";

// ── Classification code → CDE ────────────────────────────────────────────────
const CDE_CODES = new Set(["CONFIDENTIAL", "SECRET", "TOP_SECRET"]);

// ── Glossary picker (single-select, inline) ──────────────────────────────────

function InlineClassPicker({
  current,
  onSelect,
  onClear,
}: {
  current: { id: number; name: string; code: string | null } | null;
  onSelect: (termId: number, termName: string) => void;
  onClear: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen]     = useState(false);
  const [domains, setDomains] = useState<GlossaryPickerDomain[]>([]);
  const [search, setSearch]  = useState("");
  const [activeDomain, setActiveDomain] = useState<GlossaryPickerDomain | null>(null);
  const [loaded, setLoaded]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openPicker() {
    if (!loaded) {
      fetch("/api/glossary/picker").then((r) => r.json()).then((d) => { setDomains(d); setLoaded(true); });
    }
    setOpen((v) => !v);
    setSearch(""); setActiveDomain(null);
  }

  const q = search.trim().toLowerCase();
  const flat = q
    ? domains.flatMap((d) => d.terms.filter((t) => t.termName.toLowerCase().includes(q)).map((t) => ({ ...t, domainName: d.domainName })))
    : [];

  const CLASS_DOT: Record<string, string> = {
    PUBLIC: "bg-emerald-500", INTERNAL: "bg-blue-500", CONFIDENTIAL: "bg-amber-500",
    RESTRICTED: "bg-amber-600", SECRET: "bg-red-500", TOP_SECRET: "bg-red-800",
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={openPicker}
        className="flex items-center gap-1.5 text-[12px] text-brand-purple hover:underline focus:outline-none"
      >
        {current ? (
          <span className="flex items-center gap-1">
            <ClassificationTag code={current.code} />
            <span className="font-medium truncate max-w-[120px]">{current.name}</span>
          </span>
        ) : (
          <span className="text-muted italic">{t.classification.assignPlaceholder}</span>
        )}
        <svg className="w-3 h-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 bg-white border border-line rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-line-soft flex items-center gap-2 bg-canvas-soft">
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              autoFocus value={search} onChange={(e) => { setSearch(e.target.value); setActiveDomain(null); }}
              placeholder={t.classification.bulkSearchPh}
              className="bg-transparent outline-none text-sm flex-1 placeholder-muted"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {current && (
              <button
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-[12px] text-red-600 hover:bg-red-50 border-b border-line-soft"
              >
                {t.classification.removeClassification}
              </button>
            )}
            {!q && !activeDomain && domains.map((d) => (
              <button key={d.glossaryId} onClick={() => setActiveDomain(d)}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-canvas-soft text-left text-sm">
                <svg className="w-4 h-4 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <span className="flex-1 truncate">{d.domainName}</span>
                <svg className="w-3 h-3 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ))}
            {!q && activeDomain && (
              <>
                <button onClick={() => setActiveDomain(null)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-line-soft text-sm text-muted hover:text-ink">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                  {activeDomain.domainName}
                </button>
                {activeDomain.terms.map((t) => (
                  <button key={t.glossaryId} onClick={() => { onSelect(t.glossaryId, t.termName); setOpen(false); setSearch(""); }}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-canvas-soft text-left text-sm">
                    {t.classCode && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[t.classCode.toUpperCase()] ?? "bg-gray-400"}`} />}
                    <span className="flex-1">{t.termName}</span>
                    {t.isPii && <span className="text-[10px] font-bold text-red-600">PII</span>}
                    {current?.id === t.glossaryId && <svg className="w-3 h-3 text-brand-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </>
            )}
            {q && (flat.length === 0
              ? <div className="py-5 text-center text-sm text-muted">{t.classification.noMatch.replace("{search}", search)}</div>
              : flat.map((term) => (
                <button key={term.glossaryId} onClick={() => { onSelect(term.glossaryId, term.termName); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-canvas-soft text-left text-sm">
                  {term.classCode && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[term.classCode.toUpperCase()] ?? "bg-gray-400"}`} />}
                  <span className="flex-1">{term.termName}</span>
                  <span className="text-[11px] text-muted">{term.domainName}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bulk assign modal ─────────────────────────────────────────────────────────

function BulkAssignModal({
  count,
  onAssign,
  onClose,
}: {
  count: number;
  onAssign: (termId: number, termName: string) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [domains, setDomains] = useState<GlossaryPickerDomain[]>([]);
  const [selected, setSelected] = useState<{ id: number; name: string; code: string | null } | null>(null);
  const [search, setSearch]     = useState("");
  const [activeDomain, setActiveDomain] = useState<GlossaryPickerDomain | null>(null);

  useEffect(() => {
    fetch("/api/glossary/picker").then((r) => r.json()).then(setDomains);
  }, []);

  const CLASS_DOT: Record<string, string> = {
    PUBLIC: "bg-emerald-500", INTERNAL: "bg-blue-500", CONFIDENTIAL: "bg-amber-500",
    RESTRICTED: "bg-amber-600", SECRET: "bg-red-500", TOP_SECRET: "bg-red-800",
  };

  const q = search.trim().toLowerCase();
  const flat = q
    ? domains.flatMap((d) => d.terms.filter((t) => t.termName.toLowerCase().includes(q)).map((t) => ({ ...t, domainName: d.domainName })))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="font-bold text-brand-deep">{t.classification.bulkTitle}</h2>
            <p className="text-[12px] text-muted mt-0.5">{t.classification.bulkSubtitle.replace("{n}", String(count))}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-4 py-3 border-b border-line-soft">
          <div className="flex items-center gap-2 bg-canvas rounded-md px-2.5 py-1.5">
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              autoFocus value={search} onChange={(e) => { setSearch(e.target.value); setActiveDomain(null); }}
              placeholder={t.classification.bulkSearchPh}
              className="bg-transparent outline-none text-sm flex-1 placeholder-muted"
            />
          </div>
        </div>

        {selected && (
          <div className="px-6 py-2 bg-brand-purple/5 border-b border-line-soft flex items-center gap-2">
            <ClassificationTag code={selected.code} />
            <span className="text-sm font-medium text-brand-deep">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="ml-auto text-muted hover:text-ink text-sm">&times;</button>
          </div>
        )}

        <div className="max-h-60 overflow-y-auto">
          {!q && !activeDomain && domains.map((d) => (
            <button key={d.glossaryId} onClick={() => setActiveDomain(d)}
              className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-canvas-soft text-left text-sm">
              <svg className="w-4 h-4 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span className="flex-1">{d.domainName}</span>
              <span className="text-[11px] text-muted">{d.terms.length}</span>
              <svg className="w-3 h-3 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          ))}
          {!q && activeDomain && (
            <>
              <button onClick={() => setActiveDomain(null)}
                className="w-full flex items-center gap-2 px-6 py-2.5 border-b border-line-soft text-sm text-muted hover:text-ink">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                {activeDomain.domainName}
              </button>
              {activeDomain.terms.map((t) => (
                <button key={t.glossaryId}
                  onClick={() => setSelected({ id: t.glossaryId, name: t.termName, code: t.classCode })}
                  className={`w-full flex items-center gap-2 px-6 py-2.5 hover:bg-canvas-soft text-left text-sm ${selected?.id === t.glossaryId ? "bg-brand-purple/10" : ""}`}>
                  {t.classCode && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[t.classCode.toUpperCase()] ?? "bg-gray-400"}`} />}
                  <span className="flex-1">{t.termName}</span>
                  {t.isPii && <span className="text-[10px] font-bold text-red-600">PII</span>}
                  {selected?.id === t.glossaryId && <svg className="w-3.5 h-3.5 text-brand-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </>
          )}
          {q && (flat.length === 0
            ? <div className="py-8 text-center text-sm text-muted">{t.classification.noMatch.replace("{search}", search)}</div>
            : flat.map((term) => (
              <button key={term.glossaryId}
                onClick={() => setSelected({ id: term.glossaryId, name: term.termName, code: term.classCode })}
                className={`w-full flex items-center gap-2 px-6 py-2.5 hover:bg-canvas-soft text-left text-sm ${selected?.id === term.glossaryId ? "bg-brand-purple/10" : ""}`}>
                {term.classCode && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[term.classCode.toUpperCase()] ?? "bg-gray-400"}`} />}
                <span className="flex-1">{term.termName}</span>
                <span className="text-[11px] text-muted">{term.domainName}</span>
              </button>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-line">
          <p className="text-[11px] text-muted mb-3">{t.classification.bulkWorkflowNote}</p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn btn-sm">{t.classification.bulkCancel}</button>
            <button
              onClick={() => { if (selected) { onAssign(selected.id, selected.name); onClose(); } }}
              disabled={!selected}
              className="btn btn-sm btn-primary"
            >
              {t.classification.bulkApply}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label, value, sub, highlight, onClick,
}: {
  label: string; value: number; sub?: string; highlight?: boolean; onClick?: () => void;
}) {
  const base = "bg-white border border-line rounded-xl px-5 py-4 text-center shadow-sm";
  const extra = onClick ? "cursor-pointer hover:border-brand-purple/40 hover:bg-brand-purple/5 transition-colors" : "";
  return (
    <div className={`${base} ${extra}`} onClick={onClick}>
      <div className={`text-3xl font-extrabold leading-none mb-1 ${highlight ? "text-brand-purple" : "text-brand-deep"}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{label}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

type Props = {
  initialStats:  ClassificationStats;
  initialFilter: string;
  initialSearch: string;
  canEdit:       boolean;
};

export function ClassificationClient({ initialStats, initialFilter, initialSearch, canEdit }: Props) {
  const { t } = useLang();
  const [stats,   setStats]   = useState(initialStats);
  const [filter,  setFilter]  = useState(initialFilter);
  const [search,  setSearch]  = useState(initialSearch);
  const [rows,    setRows]    = useState<ClassificationColumn[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchRows = useCallback(async (f: string, s: string, p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ filter: f, page: String(p), limit: "50" });
    if (s) params.set("search", s);
    const r = await fetch(`/api/classification/columns?${params}`);
    const data = await r.json();
    setRows(data.data ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(filter, search, page); }, [filter, page]);

  function onSearchChange(v: string) {
    setSearch(v);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(1); fetchRows(filter, v, 1); }, 350);
  }

  function onFilterChange(f: string) {
    setFilter(f); setPage(1); setSelected(new Set()); fetchRows(f, search, 1);
  }

  async function refreshStats() {
    const r = await fetch("/api/classification/stats");
    const s = await r.json();
    setStats(s);
  }

  async function assignClassification(attributeIds: number[], classificationId: number | null) {
    setSaving(true);
    await fetch("/api/classification/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributeIds, classificationId }),
    });
    setSaving(false);
    setSelected(new Set());
    await Promise.all([fetchRows(filter, search, page), refreshStats()]);
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.attributeId)));
    }
  }

  const totalPages = Math.ceil(total / 50);

  const FILTERS = [
    { key: "all",          label: t.classification.filterAll,          count: stats.total },
    { key: "classified",   label: t.classification.filterClassified,   count: stats.classified },
    { key: "unclassified", label: t.classification.filterUnclassified, count: stats.unclassified },
    { key: "cde",          label: t.classification.filterCde,          count: stats.cde },
  ];

  return (
    <div>
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-deep">{t.classification.pageTitle}</h1>
        <p className="text-sm text-muted mt-1">{t.classification.pageDesc}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatTile label={t.classification.statTotalCols}  value={stats.total}        onClick={() => onFilterChange("all")} />
        <StatTile label={t.classification.statClassified} value={stats.classified}   highlight onClick={() => onFilterChange("classified")} />
        <StatTile label={t.classification.statNotClassified} value={stats.unclassified} onClick={() => onFilterChange("unclassified")} />
        <StatTile label={t.classification.statCde}        value={stats.cde}          highlight sub={t.classification.statCdeSub} onClick={() => onFilterChange("cde")} />
        <StatTile label={t.classification.statPii}        value={stats.pii}          sub={t.classification.statPiiSub} />
        <StatTile label={t.classification.statAssetTypes} value={stats.business + stats.technical}
          sub={`${stats.business} · ${stats.technical}`} />
      </div>

      {/* PI Category breakdown */}
      {stats.byPiCategory.length > 0 && (
        <div className="card px-5 py-4 mb-5 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.classification.piCategoryLabel}</span>
          {stats.byPiCategory.map((cat) => (
            <span key={cat.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
              {cat.name}
              <span className="bg-red-600 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{cat.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-line overflow-hidden text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`px-3.5 py-1.5 flex items-center gap-1.5 font-medium transition-colors ${
                filter === f.key
                  ? "bg-brand-purple text-white"
                  : "bg-white text-ink-soft hover:bg-canvas"
              }`}
            >
              {f.label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                filter === f.key ? "bg-white/20 text-white" : "bg-canvas text-muted"
              }`}>{f.count.toLocaleString()}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-1.5 flex-1 max-w-xs">
          <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={search} onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.classification.searchPlaceholder}
            className="bg-transparent outline-none text-sm flex-1 placeholder-muted"
          />
          {search && (
            <button onClick={() => onSearchChange("")} className="text-muted hover:text-ink text-sm leading-none">&times;</button>
          )}
        </div>

        {selected.size > 0 && canEdit && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] text-muted">{t.classification.selectedCount.replace("{n}", String(selected.size))}</span>
            <button
              onClick={() => setBulkModal(true)}
              className="btn btn-sm btn-primary flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              {t.classification.assignClassification}
            </button>
            <button onClick={() => setSelected(new Set())} className="btn btn-sm">{t.classification.clearSelection}</button>
          </div>
        )}

        {saving && <span className="text-[12px] text-muted ml-2">{t.classification.savingLabel}</span>}
      </div>

      {/* Workflow info banner */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 mb-4 rounded-lg bg-brand-purple/5 border border-brand-purple/20 text-[12px] text-brand-deep">
        <svg className="w-4 h-4 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
        </svg>
        {t.classification.workflowBanner}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="grid gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold"
          style={{ gridTemplateColumns: canEdit ? "32px 1.8fr 0.9fr 0.8fr 1.1fr 1.1fr 0.7fr 0.7fr 1fr" : "1.8fr 0.9fr 0.8fr 1.1fr 1.1fr 0.7fr 0.7fr 1fr" }}>
          {canEdit && (
            <div>
              <input type="checkbox" checked={selected.size === rows.length && rows.length > 0}
                onChange={toggleAll}
                className="w-4 h-4 rounded accent-brand-purple" />
            </div>
          )}
          <div>{t.classification.colColumnTable}</div>
          <div>{t.classification.colDataType}</div>
          <div>{t.classification.colAssetType}</div>
          <div>{t.classification.colClassification}</div>
          <div>{t.classification.colClassificationTerm}</div>
          <div>{t.classification.colCde}</div>
          <div>{t.classification.colPii}</div>
          <div>{t.classification.colPiCategory}</div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="py-16 text-center text-muted text-sm">{t.classification.loadingLabel}</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-muted text-sm">{t.classification.noColumnsMatch}</div>
            {filter !== "all" && (
              <button onClick={() => onFilterChange("all")} className="mt-2 text-brand-purple text-sm hover:underline">
                {t.classification.showAll}
              </button>
            )}
          </div>
        ) : (
          rows.map((row) => {
            const isCde = CDE_CODES.has((row.classTermClassCode ?? "").toUpperCase());
            const isSelected = selected.has(row.attributeId);
            return (
              <div
                key={row.attributeId}
                className={`grid gap-3 px-5 py-3 items-start text-sm border-b border-line-soft last:border-b-0 transition-colors ${isSelected ? "bg-brand-purple/5" : "hover:bg-canvas-soft"}`}
                style={{ gridTemplateColumns: canEdit ? "32px 1.8fr 0.9fr 0.8fr 1.1fr 1.1fr 0.7fr 0.7fr 1fr" : "1.8fr 0.9fr 0.8fr 1.1fr 1.1fr 0.7fr 0.7fr 1fr" }}
              >
                {canEdit && (
                  <div className="pt-px" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row.attributeId)}
                      className="w-4 h-4 rounded accent-brand-purple" />
                  </div>
                )}

                {/* Column + Table */}
                <div className="min-w-0 overflow-hidden">
                  <div className="font-semibold text-brand-deep truncate">{row.physicalName}</div>
                  <div className="text-[11px] text-muted mt-0.5 truncate">
                    <Link href={`/catalog/${row.schemaId}/tables/${row.entityId}`} className="hover:text-brand-purple hover:underline">
                      {row.entityName}
                    </Link>
                    <span className="mx-1">·</span>
                    <Link href={`/catalog/${row.schemaId}`} className="hover:text-brand-purple hover:underline">
                      {row.schemaName}
                    </Link>
                    <span className="mx-1">·</span>
                    <span>{row.sourceName}</span>
                  </div>
                </div>

                {/* Data Type */}
                <div className="min-w-0 font-mono text-[12px] text-ink-soft truncate pt-px">{row.dataType}</div>

                {/* Asset Type */}
                <div className="min-w-0">
                  {row.columnType ? (
                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                      row.columnType === "BUSINESS"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-slate-50 text-slate-600 border border-slate-200"
                    }`}>{row.columnType === "BUSINESS" ? t.classification.assetBusiness : t.classification.assetTechnical}</span>
                  ) : <span className="text-muted text-[12px]">—</span>}
                </div>

                {/* Classification (code badge) */}
                <div className="min-w-0">
                  <ClassificationTag code={row.classTermClassCode} />
                </div>

                {/* Classification Term (inline picker) */}
                <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                  {canEdit ? (
                    <InlineClassPicker
                      current={row.classTermId ? { id: row.classTermId, name: row.classTermName!, code: row.classTermClassCode } : null}
                      onSelect={(termId, _name) => assignClassification([row.attributeId], termId)}
                      onClear={() => assignClassification([row.attributeId], null)}
                    />
                  ) : (
                    row.classTermName
                      ? <span className="text-[12px] font-medium text-brand-deep">{row.classTermName}</span>
                      : <span className="text-muted text-[12px]">—</span>
                  )}
                </div>

                {/* CDE */}
                <div className="min-w-0">
                  {isCde
                    ? <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">CDE</span>
                    : <span className="text-muted text-[12px]">{row.classTermClassCode ? "No" : "—"}</span>}
                </div>

                {/* PII */}
                <div className="min-w-0">
                  {row.classTermIsPii
                    ? <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">PII</span>
                    : <span className="text-muted text-[12px]">{row.classTermClassCode ? "No" : "—"}</span>}
                </div>

                {/* PI Category */}
                <div className="min-w-0 text-[12px] text-ink-soft truncate pt-px">
                  {row.classTermPiCategoryName ?? <span className="text-muted">—</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted">
            {((page - 1) * 50 + 1).toLocaleString()}–{Math.min(page * 50, total).toLocaleString()} of {total.toLocaleString()}
          </span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="btn btn-sm disabled:opacity-40">{t.classification.prevPage}</button>
            <span className="px-3 py-1.5 text-muted">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="btn btn-sm disabled:opacity-40">{t.classification.nextPage}</button>
          </div>
        </div>
      )}

      {/* Bulk assign modal */}
      {bulkModal && (
        <BulkAssignModal
          count={selected.size}
          onAssign={(termId, termName) => assignClassification([...selected], termId)}
          onClose={() => setBulkModal(false)}
        />
      )}
    </div>
  );
}
