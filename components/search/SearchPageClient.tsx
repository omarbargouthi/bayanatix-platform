"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FullSearchHit, SearchResponse } from "@/app/api/search/route";
import { ALL_TYPES } from "@/app/api/search/route";

// ── Types ──────────────────────────────────────────────────────────────────────

type TagOption = { tagId: number; tagName: string; colorHex: string };
type UserOption = { userId: string; fullName: string; email: string };

// ── Config ─────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  TABLE:  "Table",
  VIEW:   "View",
  COLUMN: "Column",
  SCHEMA: "Schema",
  SOURCE: "Source",
  TERM:   "Business Term",
};

const TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  TABLE:  { bg: "bg-emerald-100", text: "text-emerald-700", dot: "#10b981" },
  VIEW:   { bg: "bg-indigo-100",  text: "text-indigo-700",  dot: "#6366f1" },
  COLUMN: { bg: "bg-blue-100",    text: "text-blue-700",    dot: "#3b82f6" },
  SCHEMA: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "#f59e0b" },
  SOURCE: { bg: "bg-violet-100",  text: "text-violet-700",  dot: "#7c3aed" },
  TERM:   { bg: "bg-pink-100",    text: "text-pink-700",    dot: "#ec4899" },
};

const TYPE_ICONS: Record<string, string> = {
  TABLE: "🗄️", VIEW: "👁️", COLUMN: "📊", SCHEMA: "🗂️", SOURCE: "🔌", TERM: "📖",
};

// ── Result card ────────────────────────────────────────────────────────────────

function ResultCard({ hit }: { hit: FullSearchHit }) {
  const colors = TYPE_COLORS[hit.type] ?? TYPE_COLORS.TABLE;

  return (
    <div className="card p-0 overflow-hidden hover:shadow-md transition-shadow group">
      <div className="flex items-stretch">
        {/* Color accent bar */}
        <div className="w-1 shrink-0" style={{ background: colors.dot }} />

        <div className="flex-1 px-5 py-4">
          {/* Top row: type badge + name + nav arrow */}
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${colors.bg} ${colors.text}`}>
                {TYPE_ICONS[hit.type]} {TYPE_LABELS[hit.type]}
              </span>
              <Link
                href={hit.href}
                className="text-[15px] font-bold text-ink hover:text-brand-purple transition-colors truncate"
                title={hit.name}
              >
                {hit.name}
              </Link>
              {hit.dataType && (
                <span className="text-[11px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono shrink-0">
                  {hit.dataType}
                </span>
              )}
              {hit.rowCount != null && (
                <span className="text-[11px] text-muted shrink-0">
                  {hit.rowCount.toLocaleString()} rows
                </span>
              )}
              {hit.classification && (
                <span className="text-[10px] bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded shrink-0">
                  {hit.classification}
                </span>
              )}
            </div>
            <Link
              href={hit.href}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-brand-purple hover:text-brand-purple/70"
              title="Go to asset"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>

          {/* Breadcrumb path */}
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

          {/* Description */}
          {hit.description && (
            <p className="text-[12px] text-ink-soft mt-1.5 line-clamp-2">{hit.description}</p>
          )}

          {/* Tags + stewards */}
          {(hit.tags.length > 0 || hit.stewards.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {hit.tags.map((t) => (
                <span
                  key={t.tagId}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    borderColor: t.colorHex ?? "#e5e7eb",
                    color: t.colorHex ?? "#6b7280",
                    background: (t.colorHex ?? "#e5e7eb") + "18",
                  }}
                >
                  {t.tagName}
                </span>
              ))}
              {hit.stewards.map((s) => (
                <span key={s.userId} className="text-[10px] text-muted flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-brand-purple/20 text-brand-purple text-[9px] font-bold inline-flex items-center justify-center">
                    {s.fullName.charAt(0)}
                  </span>
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

// ── Steward picker (inline typeahead) ──────────────────────────────────────────

function StewardPicker({
  selected,
  onAdd,
  onRemove,
}: {
  selected: UserOption[];
  onAdd: (u: UserOption) => void;
  onRemove: (userId: string) => void;
}) {
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

  return (
    <div className="space-y-1.5">
      {selected.map((u) => (
        <div key={u.userId} className="flex items-center justify-between bg-canvas-soft rounded-md px-2.5 py-1.5">
          <div>
            <div className="text-[12px] font-semibold text-ink">{u.fullName}</div>
            <div className="text-[10px] text-muted">{u.email}</div>
          </div>
          <button onClick={() => onRemove(u.userId)} className="text-muted hover:text-red-500 ml-2 text-sm leading-none">×</button>
        </div>
      ))}
      <div className="relative">
        <input
          value={inputQ}
          onChange={(e) => setInputQ(e.target.value)}
          placeholder="Search stewards…"
          className="w-full text-[12px] border border-line rounded-md px-2.5 py-1.5 bg-white outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20"
        />
        {suggestions.length > 0 && inputQ.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-line rounded-md shadow-md z-10 max-h-40 overflow-y-auto">
            {suggestions.map((u) => (
              <button
                key={u.userId}
                onClick={() => { onAdd(u); setInputQ(""); setSuggestions([]); }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-canvas text-[12px] border-b border-line-soft last:border-b-0"
              >
                <div className="font-semibold text-ink">{u.fullName}</div>
                <div className="text-[10px] text-muted">{u.email}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SearchPageClient({
  initialQ,
  initialTypes,
  initialStakeholders,
  initialTags,
}: {
  initialQ: string;
  initialTypes: string;
  initialStakeholders: string;
  initialTags: string;
}) {
  const router = useRouter();

  // Filter state (URL is source of truth; these are local copies that drive URL updates)
  const [activeTypes,     setActiveTypes]     = useState<Set<string>>(
    initialTypes ? new Set(initialTypes.split(",")) : new Set(ALL_TYPES)
  );
  const [selectedTagIds,  setSelectedTagIds]  = useState<number[]>(
    initialTags ? initialTags.split(",").map(Number).filter((n) => !isNaN(n)) : []
  );
  const [selectedUsers,   setSelectedUsers]   = useState<UserOption[]>([]);

  // Available options for pickers
  const [availableTags, setAvailableTags] = useState<TagOption[]>([]);

  // Results
  const [results,  setResults]  = useState<FullSearchHit[]>([]);
  const [counts,   setCounts]   = useState<Partial<Record<FullSearchHit["type"], number>>>({});
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  // Current query (kept in sync with URL so shareable)
  const [q, setQ] = useState(initialQ);

  // ── Bootstrap ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : [])
      .then(setAvailableTags)
      .catch(() => {});

    // Restore selected users from initialStakeholders
    if (initialStakeholders) {
      const ids = initialStakeholders.split(",").filter(Boolean);
      if (ids.length > 0) {
        Promise.all(ids.map((id) =>
          fetch(`/api/users/search?q=${encodeURIComponent(id)}`).then((r) => r.json())
        )).then((results) => {
          const users: UserOption[] = results.flat().filter((u: UserOption) =>
            ids.includes(u.userId)
          );
          setSelectedUsers(users);
        }).catch(() => {});
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch results ──────────────────────────────────────────────────────
  const fetchResults = useCallback(async (
    currentQ: string,
    types: Set<string>,
    tagIds: number[],
    users: UserOption[],
  ) => {
    if (currentQ.length < 2) return;
    setLoading(true);
    const params = new URLSearchParams({ q: currentQ });
    if (types.size < ALL_TYPES.length) params.set("types", [...types].join(","));
    if (tagIds.length > 0)  params.set("tags",         tagIds.join(","));
    if (users.length > 0)   params.set("stakeholders", users.map((u) => u.userId).join(","));

    try {
      const r = await fetch(`/api/search?${params.toString()}`);
      if (!r.ok) return;
      const data: SearchResponse = await r.json();
      setResults(data.results);
      setCounts(data.counts);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Sync URL + fetch on filter change ─────────────────────────────────
  const syncAndFetch = useCallback((
    newQ: string,
    newTypes: Set<string>,
    newTagIds: number[],
    newUsers: UserOption[],
  ) => {
    const params = new URLSearchParams();
    if (newQ) params.set("q", newQ);
    if (newTypes.size < ALL_TYPES.length) params.set("types", [...newTypes].join(","));
    if (newTagIds.length > 0) params.set("tags", newTagIds.join(","));
    if (newUsers.length > 0)  params.set("stakeholders", newUsers.map((u) => u.userId).join(","));

    router.replace(`/search?${params.toString()}`, { scroll: false });
    fetchResults(newQ, newTypes, newTagIds, newUsers);
  }, [router, fetchResults]);

  // Initial fetch on mount
  useEffect(() => {
    if (initialQ.length >= 2) {
      fetchResults(initialQ, activeTypes, selectedTagIds, selectedUsers);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter handlers ────────────────────────────────────────────────────
  function toggleType(type: string) {
    const next = new Set(activeTypes);
    if (next.has(type)) { next.delete(type); } else { next.add(type); }
    setActiveTypes(next);
    syncAndFetch(q, next, selectedTagIds, selectedUsers);
  }

  function setOnlyType(type: string | null) {
    const next = type ? new Set([type]) : new Set(ALL_TYPES);
    setActiveTypes(next);
    syncAndFetch(q, next, selectedTagIds, selectedUsers);
  }

  function toggleTag(tagId: number) {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
    syncAndFetch(q, activeTypes, next, selectedUsers);
  }

  function addUser(u: UserOption) {
    if (selectedUsers.some((s) => s.userId === u.userId)) return;
    const next = [...selectedUsers, u];
    setSelectedUsers(next);
    syncAndFetch(q, activeTypes, selectedTagIds, next);
  }

  function removeUser(userId: string) {
    const next = selectedUsers.filter((u) => u.userId !== userId);
    setSelectedUsers(next);
    syncAndFetch(q, activeTypes, selectedTagIds, next);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    syncAndFetch(q, activeTypes, selectedTagIds, selectedUsers);
  }

  const total       = results.length;
  const allSelected = activeTypes.size === ALL_TYPES.length;
  const hasFilters  = !allSelected || selectedTagIds.length > 0 || selectedUsers.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="flex-1 flex items-center gap-2 bg-white border border-line rounded-lg px-4 py-2.5 focus-within:border-brand-purple focus-within:ring-1 focus-within:ring-brand-purple/20">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-muted shrink-0">
            <circle cx="8.5" cy="8.5" r="5.5" /><path d="M14.5 14.5L18 18" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search assets, tables, columns, terms…"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-muted hover:text-ink text-base leading-none">×</button>
          )}
        </div>
        <button
          type="submit"
          disabled={q.length < 2}
          className="px-5 py-2.5 bg-brand-purple text-white rounded-lg text-sm font-semibold hover:bg-brand-purple/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          Search
        </button>
      </form>

      {/* ── Heading + type summary chips ──────────────────────────────── */}
      {(searched || loading) && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-3">
            <h1 className="text-xl font-bold text-ink">
              {loading ? "Searching…" : `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
            </h1>
            {q && <span className="text-sm text-muted">for <span className="font-semibold text-ink">"{q}"</span></span>}
            {hasFilters && !loading && (
              <button
                onClick={() => {
                  setActiveTypes(new Set(ALL_TYPES));
                  setSelectedTagIds([]);
                  setSelectedUsers([]);
                  syncAndFetch(q, new Set(ALL_TYPES), [], []);
                }}
                className="ml-2 text-[11px] text-brand-purple hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Type summary chips */}
          {!loading && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setOnlyType(null)}
                className={`text-[12px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                  allSelected
                    ? "bg-brand-purple text-white border-brand-purple"
                    : "bg-white text-ink-soft border-line hover:border-brand-purple hover:text-brand-purple"
                }`}
              >
                All ({total})
              </button>
              {ALL_TYPES.filter((t) => counts[t]).map((type) => {
                const c = TYPE_COLORS[type];
                const isActive = activeTypes.size === 1 && activeTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => setOnlyType(type)}
                    className={`text-[12px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                      isActive
                        ? `${c.bg} ${c.text} border-transparent`
                        : "bg-white text-ink-soft border-line hover:border-current"
                    }`}
                    style={isActive ? {} : { "--hover-color": c.dot } as React.CSSProperties}
                  >
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
          <p className="text-sm text-muted max-w-sm mx-auto">
            Find tables, views, columns, schemas, business terms, and more. Use filters to narrow results.
          </p>
        </div>
      )}

      {/* ── Main layout: filters + results ────────────────────────────── */}
      {(searched || loading) && (
        <div className="flex gap-6 items-start">
          {/* ── Filter sidebar ────────────────────────────────────────── */}
          <aside className="w-56 shrink-0 sticky top-[72px] space-y-5">
            {/* Asset Types */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-3">Asset Type</h3>
              <div className="space-y-2">
                {ALL_TYPES.map((type) => {
                  const c = TYPE_COLORS[type];
                  const count = counts[type] ?? 0;
                  const checked = activeTypes.has(type);
                  return (
                    <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleType(type)}
                        className="rounded border-line text-brand-purple focus:ring-brand-purple/30 cursor-pointer"
                      />
                      <span className={`text-[10px] w-2 h-2 rounded-full shrink-0`} style={{ background: c.dot }} />
                      <span className="text-[13px] text-ink flex-1">{TYPE_LABELS[type]}</span>
                      <span className="text-[11px] text-muted">{count}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            {availableTags.length > 0 && (
              <div className="card p-4">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-3">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.tagId);
                    return (
                      <button
                        key={tag.tagId}
                        onClick={() => toggleTag(tag.tagId)}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
                        style={
                          active
                            ? { background: tag.colorHex, color: "#fff", borderColor: tag.colorHex }
                            : { borderColor: tag.colorHex, color: tag.colorHex, background: tag.colorHex + "18" }
                        }
                      >
                        {tag.tagName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stewards */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted mb-3">Steward / Owner</h3>
              <StewardPicker
                selected={selectedUsers}
                onAdd={addUser}
                onRemove={removeUser}
              />
            </div>
          </aside>

          {/* ── Results ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full" />
              </div>
            )}

            {!loading && results.length === 0 && searched && (
              <div className="card p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <h3 className="font-semibold text-ink mb-1">No results found</h3>
                <p className="text-sm text-muted">
                  Try different keywords or remove some filters.
                </p>
              </div>
            )}

            {!loading && results.map((hit, i) => (
              <ResultCard key={`${hit.type}-${hit.id}-${i}`} hit={hit} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
