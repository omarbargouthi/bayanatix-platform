"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FullSearchHit, SearchHitType, SearchResponse } from "@/lib/search-types";
import { ALL_TYPES } from "@/lib/search-types";

// ── Types ──────────────────────────────────────────────────────────────────────

type TagOption  = { tagId: number; tagName: string; colorHex: string | null };
type UserOption = { userId: string; fullName: string; email: string };
type SavedSearch = { savedSearchId: number; name: string; queryString: string };
type InitialParams = {
  q?: string; types?: string; tags?: string; owner?: string; classification?: string;
  status?: string; domain?: string; since?: string; dqDimension?: string; dsaScope?: string;
  customTypeCode?: string;
};
type CustomTypeOption = { typeCode: string; typeNameText: string };

// ── Config ─────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<SearchHitType, string> = {
  TABLE: "Table", VIEW: "View", COLUMN: "Column", SCHEMA: "Schema", SOURCE: "Source",
  TERM: "Business Term", TAG: "Tag", DQ_RULE: "DQ Rule", SHARING_AGREEMENT: "Sharing Agreement",
  OPEN_DATA: "Open Data", FOI_REQUEST: "FOI Request", REGISTER_ENTRY: "Register Entry",
  CUSTOM_ASSET: "Custom Asset",
};

const TYPE_COLORS: Record<SearchHitType, { bg: string; text: string; dot: string }> = {
  TABLE:  { bg: "bg-emerald-100", text: "text-emerald-700", dot: "#10b981" },
  VIEW:   { bg: "bg-indigo-100",  text: "text-indigo-700",  dot: "#6366f1" },
  COLUMN: { bg: "bg-blue-100",    text: "text-blue-700",    dot: "#3b82f6" },
  SCHEMA: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "#f59e0b" },
  SOURCE: { bg: "bg-violet-100",  text: "text-violet-700",  dot: "#7c3aed" },
  TERM:   { bg: "bg-pink-100",    text: "text-pink-700",    dot: "#ec4899" },
  TAG:    { bg: "bg-teal-100",    text: "text-teal-700",    dot: "#14b8a6" },
  DQ_RULE:{ bg: "bg-orange-100",  text: "text-orange-700",  dot: "#f97316" },
  SHARING_AGREEMENT: { bg: "bg-cyan-100", text: "text-cyan-700", dot: "#06b6d4" },
  OPEN_DATA: { bg: "bg-lime-100", text: "text-lime-700", dot: "#84cc16" },
  FOI_REQUEST: { bg: "bg-rose-100", text: "text-rose-700", dot: "#f43f5e" },
  REGISTER_ENTRY: { bg: "bg-slate-100", text: "text-slate-700", dot: "#64748b" },
  CUSTOM_ASSET: { bg: "bg-fuchsia-100", text: "text-fuchsia-700", dot: "#c026d3" },
};

const TYPE_ICONS: Record<SearchHitType, string> = {
  TABLE: "🗄️", VIEW: "👁️", COLUMN: "📊", SCHEMA: "🗂️", SOURCE: "🔌", TERM: "📖",
  TAG: "🏷️", DQ_RULE: "✅", SHARING_AGREEMENT: "🤝", OPEN_DATA: "🌐", FOI_REQUEST: "📩", REGISTER_ENTRY: "📋",
  CUSTOM_ASSET: "🧩",
};

const CLASSIFICATION_OPTIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET"];
const DSA_STATUS_OPTIONS = ["DRAFT", "OWNER_REVIEW", "APPROVED", "ACTIVE", "TERMINATED"];
const DSA_SCOPE_OPTIONS = ["INTERNAL", "EXTERNAL_GOV"];
const OPEN_DATA_STATUS_OPTIONS = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "REJECTED", "PENDING"];
const FOI_STATUS_OPTIONS = ["SUBMITTED", "IN_FULFILLMENT", "DELIVERED"];
const DATE_PRESETS = [
  { label: "Any time", value: "" },
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

function presetToIso(days: string): string {
  if (!days) return "";
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  return d.toISOString().slice(0, 10);
}

// ── Result card ────────────────────────────────────────────────────────────────

function MetaBadge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "amber" | "red" | "green" }) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600", amber: "bg-amber-50 text-amber-700 border border-amber-200",
    red: "bg-red-50 text-red-600 border border-red-200", green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${tones[tone]}`}>{children}</span>;
}

function ResultCard({ hit }: { hit: FullSearchHit }) {
  const colors = TYPE_COLORS[hit.type] ?? TYPE_COLORS.TABLE;
  const m = hit.meta ?? {};
  return (
    <div className="card p-0 overflow-hidden hover:shadow-md transition-shadow group">
      <div className="flex items-stretch">
        <div className="w-1 shrink-0" style={{ background: colors.dot }} />
        <div className="flex-1 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${colors.bg} ${colors.text}`}>
                {TYPE_ICONS[hit.type]} {TYPE_LABELS[hit.type]}
              </span>
              <Link href={hit.href} className="text-[15px] font-bold text-ink hover:text-brand-purple transition-colors truncate" title={hit.name}>
                {hit.name}
              </Link>
              {hit.dataType && <span className="text-[11px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono shrink-0">{hit.dataType}</span>}
              {hit.rowCount != null && <span className="text-[11px] text-muted shrink-0">{hit.rowCount.toLocaleString()} rows</span>}
              {hit.classification && <MetaBadge tone={hit.classification === "SECRET" || hit.classification === "TOP_SECRET" ? "red" : "gray"}>{hit.classification}</MetaBadge>}

              {hit.type === "TAG" && m.usageCount != null && <MetaBadge>{m.usageCount} asset{m.usageCount !== 1 ? "s" : ""}</MetaBadge>}
              {hit.type === "DQ_RULE" && m.dimension && <MetaBadge>{m.dimension}</MetaBadge>}
              {hit.type === "DQ_RULE" && m.severity && <MetaBadge tone={m.severity === "CRITICAL" || m.severity === "HIGH" ? "red" : "amber"}>{m.severity}</MetaBadge>}
              {hit.type === "DQ_RULE" && <MetaBadge tone={m.isActive ? "green" : "gray"}>{m.isActive ? "Active" : "Inactive"}</MetaBadge>}
              {hit.type === "SHARING_AGREEMENT" && m.scope && <MetaBadge>{m.scope}</MetaBadge>}
              {hit.type === "SHARING_AGREEMENT" && m.status && <MetaBadge tone="amber">{m.status}</MetaBadge>}
              {hit.type === "SHARING_AGREEMENT" && m.expiryDate && <span className="text-[11px] text-muted shrink-0">expires {m.expiryDate}</span>}
              {hit.type === "OPEN_DATA" && m.status && <MetaBadge tone={m.status === "PUBLISHED" ? "green" : "amber"}>{m.status}</MetaBadge>}
              {hit.type === "FOI_REQUEST" && m.status && <MetaBadge tone="amber">{m.status}</MetaBadge>}
              {hit.type === "FOI_REQUEST" && m.dueDate && <span className="text-[11px] text-muted shrink-0">due {m.dueDate}</span>}
              {hit.type === "FOI_REQUEST" && m.officerName && <span className="text-[11px] text-muted shrink-0">· {m.officerName}</span>}
            </div>
            <Link href={hit.href} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-brand-purple" title="Go to asset">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>

          {hit.path.length > 0 && (
            <div className="flex items-center gap-1 mt-1 text-[11px] text-muted">
              {hit.path.map((p, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-line">›</span>}
                  <span>{p}</span>
                </span>
              ))}
            </div>
          )}

          {hit.description && <p className="text-[12px] text-ink-soft mt-1.5 line-clamp-2">{hit.description}</p>}

          {(hit.tags.length > 0 || hit.stewards.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {hit.tags.map((t) => (
                <span key={t.tagId} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ borderColor: t.colorHex ?? "#e5e7eb", color: t.colorHex ?? "#6b7280", background: (t.colorHex ?? "#e5e7eb") + "18" }}>
                  {t.tagName}
                </span>
              ))}
              {hit.stewards.map((s) => (
                <span key={s.userId} className="text-[10px] text-muted flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-brand-purple/20 text-brand-purple text-[9px] font-bold inline-flex items-center justify-center">{s.fullName.charAt(0)}</span>
                  {s.fullName}
                  <span className="text-line">·</span>
                  <span>{s.roleCode === "OWNER" ? "Owner" : s.roleCode === "BIZ_STEWARD" ? "Business Steward" : "Technical Steward"}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Owner picker (single-select typeahead) ─────────────────────────────────────

function OwnerPicker({ selected, onSelect, onClear }: { selected: UserOption | null; onSelect: (u: UserOption) => void; onClear: () => void }) {
  const [inputQ, setInputQ] = useState("");
  const [suggestions, setSuggestions] = useState<UserOption[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputQ.trim().length < 1) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await fetch(`/api/users/search?q=${encodeURIComponent(inputQ)}`);
      if (r.ok) setSuggestions(await r.json());
    }, 200);
  }, [inputQ]);

  if (selected) {
    return (
      <div className="flex items-center justify-between bg-canvas-soft rounded-md px-2.5 py-1.5">
        <div>
          <div className="text-[12px] font-semibold text-ink">{selected.fullName}</div>
          <div className="text-[10px] text-muted">{selected.email}</div>
        </div>
        <button onClick={onClear} className="text-muted hover:text-red-500 ml-2 text-sm leading-none">×</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={inputQ}
        onChange={(e) => setInputQ(e.target.value)}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        placeholder="Search owner / steward…"
        className="w-full text-[12px] border border-line rounded-md px-2.5 py-1.5 bg-white outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
      />
      {suggestions.length > 0 && inputQ.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-line rounded-md shadow-md z-10 max-h-40 overflow-y-auto">
          {suggestions.map((u) => (
            <button key={u.userId} onClick={() => { onSelect(u); setInputQ(""); setSuggestions([]); }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-canvas text-[12px] border-b border-line-soft last:border-b-0">
              <div className="font-semibold text-ink">{u.fullName}</div>
              <div className="text-[10px] text-muted">{u.email}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SearchPageClient({ initialParams }: { initialParams: InitialParams }) {
  const router = useRouter();

  const [q, setQ] = useState(initialParams.q ?? "");
  const [activeTypes, setActiveTypes] = useState<Set<SearchHitType>>(
    initialParams.types ? new Set(initialParams.types.split(",") as SearchHitType[]) : new Set(ALL_TYPES)
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    initialParams.tags ? initialParams.tags.split(",").map(Number).filter((n) => !isNaN(n)) : []
  );
  const [ownerUser, setOwnerUser] = useState<UserOption | null>(null);
  const [classification, setClassification] = useState(initialParams.classification ?? "");
  const [status, setStatus] = useState(initialParams.status ?? "");
  const [domain, setDomain] = useState(initialParams.domain ?? "");
  const [since, setSince] = useState(initialParams.since ?? "");
  const [dqDimension, setDqDimension] = useState(initialParams.dqDimension ?? "");
  const [dsaScope, setDsaScope] = useState(initialParams.dsaScope ?? "");
  const [customTypeCode, setCustomTypeCode] = useState(initialParams.customTypeCode ?? "");
  const [customTypeOptions, setCustomTypeOptions] = useState<CustomTypeOption[]>([]);

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<FullSearchHit[]>([]);
  const [counts, setCounts] = useState<Partial<Record<SearchHitType, number>>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [dqDimensionOptions, setDqDimensionOptions] = useState<{ code: string; name: string }[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    fetch("/api/sharing/dq-dimensions").then((r) => r.ok ? r.json() : []).then(setDqDimensionOptions).catch(() => {});
    fetch("/api/search/saved").then((r) => r.ok ? r.json() : { saved: [] }).then((d) => setSavedSearches(d.saved ?? [])).catch(() => {});
    fetch("/api/admin/custom-asset-types").then((r) => r.ok ? r.json() : []).then(setCustomTypeOptions).catch(() => {});
  }, []);

  // ── Derive tag refinement options from actual results ──────────────────
  const resultTags = useMemo(() => {
    const map = new Map<number, TagOption>();
    for (const hit of results) for (const t of hit.tags) if (!map.has(t.tagId)) map.set(t.tagId, t);
    return [...map.values()];
  }, [results]);

  const tagResultCounts = useMemo(() => {
    const c = new Map<number, number>();
    for (const hit of results) for (const t of hit.tags) c.set(t.tagId, (c.get(t.tagId) ?? 0) + 1);
    return c;
  }, [results]);

  const singleType: SearchHitType | null = activeTypes.size === 1 ? [...activeTypes][0] : null;

  // ── Build the canonical query string (used for URL sync + saved searches) ──
  const buildParams = useCallback((currentPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (activeTypes.size < ALL_TYPES.length) params.set("types", [...activeTypes].join(","));
    if (selectedTagIds.length > 0) params.set("tags", selectedTagIds.join(","));
    if (ownerUser) params.set("owner", ownerUser.userId);
    if (classification) params.set("classification", classification);
    if (status) params.set("status", status);
    if (domain) params.set("domain", domain);
    if (since) params.set("since", since);
    if (dqDimension) params.set("dqDimension", dqDimension);
    if (dsaScope) params.set("dsaScope", dsaScope);
    if (customTypeCode) params.set("customTypeCode", customTypeCode);
    if (currentPage > 1) params.set("page", String(currentPage));
    return params;
  }, [q, activeTypes, selectedTagIds, ownerUser, classification, status, domain, since, dqDimension, dsaScope, customTypeCode]);

  const fetchResults = useCallback(async (currentPage: number, append: boolean) => {
    if (q.length < 2) return;
    if (append) setLoadingMore(true); else setLoading(true);
    const params = buildParams(currentPage);
    params.set("limit", "50");
    try {
      const r = await fetch(`/api/search?${params.toString()}`);
      if (!r.ok) return;
      const data: SearchResponse = await r.json();
      setResults((prev) => append ? [...prev, ...data.results] : data.results);
      setCounts(data.counts);
      setTotal(data.total);
      setSuggestions(data.suggestions ?? []);
      setSearched(true);
      setPage(currentPage);
    } finally { setLoading(false); setLoadingMore(false); }
  }, [q, buildParams]);

  const syncAndFetch = useCallback(() => {
    const params = buildParams(1);
    router.replace(`/search?${params.toString()}`, { scroll: false });
    fetchResults(1, false);
  }, [buildParams, fetchResults, router]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      // Restore selected owner from URL, then run the initial fetch.
      if (initialParams.owner) {
        fetch(`/api/users/search?q=${encodeURIComponent(initialParams.owner)}`)
          .then((r) => r.json())
          .then((users: UserOption[]) => {
            const match = users.find((u) => u.userId === initialParams.owner);
            if (match) setOwnerUser(match);
          }).catch(() => {})
          .finally(() => { if (q.length >= 2) fetchResults(1, false); });
      } else if (q.length >= 2) {
        fetchResults(1, false);
      }
      return;
    }
    syncAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTypes, selectedTagIds, ownerUser, classification, status, domain, since, dqDimension, dsaScope, customTypeCode]);

  function toggleType(type: SearchHitType) {
    const next = new Set(activeTypes);
    if (next.has(type)) { next.delete(type); } else { next.add(type); }
    if (next.size === 0) return;
    setActiveTypes(next);
  }

  function setOnlyType(type: SearchHitType | null) {
    setActiveTypes(type ? new Set([type]) : new Set(ALL_TYPES));
  }

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  }

  function clearFilters() {
    setActiveTypes(new Set(ALL_TYPES)); setSelectedTagIds([]); setOwnerUser(null);
    setClassification(""); setStatus(""); setDomain(""); setSince(""); setDqDimension(""); setDsaScope("");
    setCustomTypeCode("");
  }

  async function saveThisSearch() {
    const name = window.prompt("Name this saved search:", q);
    if (!name || !name.trim()) return;
    const queryString = buildParams(1).toString();
    const r = await fetch("/api/search/saved", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), queryString }),
    });
    if (r.ok) {
      const created = await r.json();
      setSavedSearches((prev) => [created, ...prev]);
    }
  }

  function loadSavedSearch(s: SavedSearch) {
    router.push(`/search?${s.queryString}`);
    router.refresh();
  }

  async function deleteSavedSearch(id: number) {
    await fetch(`/api/search/saved/${id}`, { method: "DELETE" });
    setSavedSearches((prev) => prev.filter((s) => s.savedSearchId !== id));
  }

  const allSelected = activeTypes.size === ALL_TYPES.length;
  const hasFilters  = !allSelected || selectedTagIds.length > 0 || ownerUser || classification || status || domain || since || dqDimension || dsaScope || customTypeCode;
  const canLoadMore = results.length < total;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Search bar */}
      <form onSubmit={(e) => { e.preventDefault(); syncAndFetch(); }} className="flex gap-3 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-white border border-line rounded-lg px-4 py-2.5 focus-within:border-brand-purple focus-within:ring-1 focus-within:ring-brand-purple/20">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-muted shrink-0">
            <circle cx="8.5" cy="8.5" r="5.5" /><path d="M14.5 14.5L18 18" strokeLinecap="round" />
          </svg>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder='Search assets, tables, columns, terms…  Try name:customer or type:column classification:secret'
            className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted" />
          {q && <button type="button" onClick={() => setQ("")} className="text-muted hover:text-ink text-base leading-none">×</button>}
        </div>
        <button type="submit" disabled={q.length < 2}
          className="px-5 py-2.5 bg-brand-purple text-white rounded-lg text-sm font-semibold hover:bg-brand-purple/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
          Search
        </button>
      </form>

      {/* Saved searches strip */}
      {savedSearches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          <span className="text-[11px] text-muted font-semibold">Saved:</span>
          {savedSearches.map((s) => (
            <span key={s.savedSearchId} className="inline-flex items-center gap-1 text-[11px] bg-canvas-soft border border-line rounded-full pl-2.5 pr-1 py-0.5">
              <button onClick={() => loadSavedSearch(s)} className="text-ink-soft hover:text-brand-purple font-semibold">{s.name}</button>
              <button onClick={() => deleteSavedSearch(s.savedSearchId)} className="text-muted hover:text-red-500 px-1 leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Result heading + type chips */}
      {(searched || loading) && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-3 flex-wrap">
            <h1 className="text-xl font-bold text-ink">
              {loading ? "Searching…" : `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
            </h1>
            {q && <span className="text-sm text-muted">for <span className="font-semibold text-ink">"{q}"</span></span>}
            {!loading && (
              <button onClick={saveThisSearch} className="ml-1 text-[11px] font-semibold text-brand-purple hover:underline">💾 Save this search</button>
            )}
            {hasFilters && !loading && (
              <button onClick={clearFilters} className="text-[11px] text-brand-purple hover:underline">Clear filters</button>
            )}
          </div>
          {!loading && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOnlyType(null)}
                className={`text-[12px] font-semibold px-3 py-1 rounded-full border transition-colors ${allSelected ? "bg-brand-purple text-white border-brand-purple" : "bg-white text-ink-soft border-line hover:border-brand-purple hover:text-brand-purple"}`}>
                All ({total})
              </button>
              {ALL_TYPES.filter((t) => counts[t]).map((type) => {
                const c = TYPE_COLORS[type];
                const isActive = activeTypes.size === 1 && activeTypes.has(type);
                return (
                  <button key={type} onClick={() => setOnlyType(type)}
                    className={`text-[12px] font-semibold px-3 py-1 rounded-full border transition-colors ${isActive ? `${c.bg} ${c.text} border-transparent` : "bg-white text-ink-soft border-line"}`}>
                    {TYPE_LABELS[type]} ({counts[type]})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!searched && !loading && q.length < 2 && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="font-semibold text-ink mb-1">Search across your data assets</h3>
          <p className="text-sm text-muted max-w-sm mx-auto">Find tables, views, columns, schemas, business terms, tags, DQ rules, sharing agreements, open data, and FOI requests. Use filters to narrow results.</p>
        </div>
      )}

      {(searched || loading) && (
        <div className="flex gap-6 items-start">
          {/* ── Filter sidebar ─────────────────────────────────────────── */}
          <aside className="w-56 shrink-0 sticky top-[72px] space-y-4">

            {/* Asset Type */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-3">Asset Type</h3>
              <div className="space-y-2">
                {ALL_TYPES.map((type) => {
                  const c = TYPE_COLORS[type];
                  return (
                    <label key={type} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={activeTypes.has(type)} onChange={() => toggleType(type)}
                        className="rounded border-line text-brand-purple focus:ring-brand-purple/30 cursor-pointer" />
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
                      <span className="text-[13px] text-ink flex-1">{TYPE_LABELS[type]}</span>
                      <span className="text-[11px] text-muted">{counts[type] ?? 0}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Classification (COLUMN / TERM / SHARING_AGREEMENT) */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-2">Classification</h3>
              <select value={classification} onChange={(e) => setClassification(e.target.value)}
                className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                <option value="">Any</option>
                {CLASSIFICATION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Date Modified */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-2">Date Modified</h3>
              <select value={since} onChange={(e) => setSince(presetToIso(e.target.value))}
                className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <p className="text-[10px] text-muted mt-1.5">Applies to Terms, DQ Rules, Agreements, Open Data, FOI, and Register Entries — not Tables/Columns (no modified-date tracked yet).</p>
            </div>

            {/* Type-specific facets */}
            {singleType === "DQ_RULE" && (
              <div className="card p-4 space-y-2.5">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted">DQ Rule Filters</h3>
                <select value={dqDimension} onChange={(e) => setDqDimension(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any dimension</option>
                  {dqDimensionOptions.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any status</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </div>
            )}
            {singleType === "SHARING_AGREEMENT" && (
              <div className="card p-4 space-y-2.5">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted">Agreement Filters</h3>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any status</option>
                  {DSA_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={dsaScope} onChange={(e) => setDsaScope(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any scope</option>
                  {DSA_SCOPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {singleType === "OPEN_DATA" && (
              <div className="card p-4">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-2">Publication Status</h3>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any status</option>
                  {OPEN_DATA_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {singleType === "CUSTOM_ASSET" && customTypeOptions.length > 0 && (
              <div className="card p-4">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-2">Custom Type</h3>
                <select value={customTypeCode} onChange={(e) => setCustomTypeCode(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any type</option>
                  {customTypeOptions.map((t) => <option key={t.typeCode} value={t.typeCode}>{t.typeNameText}</option>)}
                </select>
              </div>
            )}
            {singleType === "FOI_REQUEST" && (
              <div className="card p-4">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-2">Request Status</h3>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-[12px] border border-line rounded-md px-2 py-1.5 bg-white">
                  <option value="">Any status</option>
                  {FOI_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Tags from results */}
            {resultTags.length > 0 && (
              <div className="card p-4">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-1">Tags in Results</h3>
                <p className="text-[10px] text-muted mb-2.5">Filter by tags found in results</p>
                <div className="flex flex-wrap gap-1.5">
                  {resultTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.tagId);
                    const cnt = tagResultCounts.get(tag.tagId) ?? 0;
                    return (
                      <button key={tag.tagId} onClick={() => toggleTag(tag.tagId)}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1"
                        style={active
                          ? { background: tag.colorHex ?? "#6058A0", color: "#fff", borderColor: tag.colorHex ?? "#6058A0" }
                          : { borderColor: tag.colorHex ?? "#e5e7eb", color: tag.colorHex ?? "#6b7280", background: (tag.colorHex ?? "#e5e7eb") + "18" }
                        }>
                        {tag.tagName}
                        <span className="opacity-60">({cnt})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Owner / Steward */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-3">Owner / Steward</h3>
              <OwnerPicker selected={ownerUser} onSelect={setOwnerUser} onClear={() => setOwnerUser(null)} />
            </div>
          </aside>

          {/* ── Results ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-3">
            {!loading && results.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-[12px] text-muted">{results.length} of {total.toLocaleString()} result{total !== 1 ? "s" : ""}</span>
                <ExportResultsButton results={results} />
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full" />
              </div>
            )}
            {!loading && results.length === 0 && searched && (
              <div className="card p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <h3 className="font-semibold text-ink mb-1">No results found</h3>
                <p className="text-sm text-muted">Try different keywords or remove some filters.</p>
                {suggestions.length > 0 && (
                  <p className="text-sm text-ink-soft mt-3">
                    Did you mean:{" "}
                    {suggestions.map((s, i) => (
                      <span key={s}>
                        {i > 0 && ", "}
                        <button onClick={() => { setQ(s); syncAndFetch(); }} className="text-brand-purple font-semibold hover:underline">{s}</button>
                      </span>
                    ))}
                    ?
                  </p>
                )}
              </div>
            )}
            {!loading && results.map((hit, i) => (
              <ResultCard key={`${hit.type}-${hit.id}-${i}`} hit={hit} />
            ))}
            {!loading && canLoadMore && (
              <div className="flex justify-center pt-2">
                <button onClick={() => fetchResults(page + 1, true)} disabled={loadingMore}
                  className="px-5 py-2 text-sm font-semibold text-brand-purple border border-brand-purple/30 rounded-lg hover:bg-brand-purple/5 disabled:opacity-50 transition-colors">
                  {loadingMore ? "Loading…" : `Load more (${total - results.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export results (Bulk Download handoff — spec §2.1) ──────────────────────────

const HIT_TYPE_TO_ASSET_TYPE: Record<string, string | null> = {
  TABLE: "DATA_ENTITIES", VIEW: "DATA_ENTITIES", COLUMN: "DATA_ATTRIBUTES",
  SOURCE: "DATA_SOURCES", TERM: "BUSINESS_TERMS", SCHEMA: null, // no Schemas sheet in the bulk template
  TAG: null, DQ_RULE: null, SHARING_AGREEMENT: null, OPEN_DATA: null, FOI_REQUEST: null, REGISTER_ENTRY: null,
  CUSTOM_ASSET: null, // Bulk's SEARCH_RESULTS scope resolves core-asset refs only; custom assets have their own dedicated bulk sheet (by type/relationship, not by search-result ref)
};

function ExportResultsButton({ results }: { results: FullSearchHit[] }) {
  const [busy, setBusy] = useState(false);

  async function exportResults() {
    const refs = results
      .map((h) => ({ assetType: HIT_TYPE_TO_ASSET_TYPE[h.type], assetId: h.id }))
      .filter((r): r is { assetType: string; assetId: number } => r.assetType != null);
    if (refs.length === 0) {
      alert("None of the current results are exportable (tables, columns, sources, and business terms only).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/bulk/downloads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: { type: "SEARCH_RESULTS", refs } }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Export failed"); return; }
      window.location.href = `/api/bulk/jobs/${data.jobId}/file`;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={exportResults} disabled={busy} className="text-[11px] font-semibold text-brand-purple hover:underline disabled:opacity-50">
      {busy ? "Preparing…" : "⭳ Export results to Excel"}
    </button>
  );
}
