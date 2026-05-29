"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecentAsset } from "@/lib/types";
import type { SearchResult } from "@/app/api/catalog/search/route";
import { ALL_TYPES } from "@/lib/search-types";
import { useLang } from "@/lib/lang-context";

type Props = {
  recentAssets:   RecentAsset[];
  recentSearches: string[];
};

type TagOption  = { tagId: number; tagName: string; colorHex: string };
type UserOption = { userId: string; fullName: string; email: string };

// ── Icons ──────────────────────────────────────────────────────────────────────

function TableIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function ColumnIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function SchemaIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>; }
function TermIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ClockIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></svg>; }

function AssetIcon({ type }: { type: string }) {
  if (type === "COLUMN")              return <ColumnIcon />;
  if (type === "SCHEMA")              return <SchemaIcon />;
  if (type === "GLOSSARY" || type === "TERM") return <TermIcon />;
  return <TableIcon />;
}

function fmtCount(n: number | null) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const RESULT_ICON: Record<string, React.ReactNode> = {
  TABLE: <TableIcon />, VIEW: <TableIcon />, COLUMN: <ColumnIcon />,
  SCHEMA: <SchemaIcon />, SOURCE: <SchemaIcon />, TERM: <TermIcon />,
};

// ── Component ──────────────────────────────────────────────────────────────────

export function DashboardSearch({ recentAssets, recentSearches }: Props) {
  const router = useRouter();
  const { t } = useLang();

  const TYPE_LABEL: Record<string, string> = {
    TABLE: t.dashboard.assetTypes.table, VIEW: t.dashboard.assetTypes.view,
    COLUMN: t.dashboard.assetTypes.column, SCHEMA: t.dashboard.assetTypes.schema,
    SOURCE: t.dashboard.assetTypes.source, TERM: t.dashboard.assetTypes.term,
  };
  const TYPE_CONFIG = [
    { key: "TABLE",  label: t.dashboard.assetTypes.tables  },
    { key: "VIEW",   label: t.dashboard.assetTypes.views   },
    { key: "COLUMN", label: t.dashboard.assetTypes.columns },
    { key: "SCHEMA", label: t.dashboard.assetTypes.schemas },
    { key: "SOURCE", label: t.dashboard.assetTypes.sources },
    { key: "TERM",   label: t.dashboard.assetTypes.terms   },
  ];

  const [focused,   setFocused]   = useState(false);
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<SearchResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters
  const [activeTypes,   setActiveTypes]   = useState<Set<string>>(new Set(ALL_TYPES));
  const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
  const [selectedTags,  setSelectedTags]  = useState<number[]>([]);
  const [userQ,         setUserQ]         = useState("");
  const [userSugg,      setUserSugg]      = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const userDebounce    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHistory = focused && query.length === 0;
  const showResults = focused && query.length >= 2;

  useEffect(() => {
    fetch("/api/tags").then((r) => r.ok ? r.json() : []).then(setAvailableTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (userDebounce.current) clearTimeout(userDebounce.current);
    if (userQ.trim().length < 1) { setUserSugg([]); return; }
    userDebounce.current = setTimeout(async () => {
      const r = await fetch(`/api/users/search?q=${encodeURIComponent(userQ)}`);
      if (r.ok) setUserSugg(await r.json());
    }, 200);
  }, [userQ]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setResults(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  function buildSearchUrl() {
    const params = new URLSearchParams({ q: query.trim() });
    if (activeTypes.size < ALL_TYPES.length) params.set("types", [...activeTypes].join(","));
    if (selectedTags.length > 0)  params.set("tags", selectedTags.join(","));
    if (selectedUsers.length > 0) params.set("stakeholders", selectedUsers.map((u) => u.userId).join(","));
    return `/search?${params.toString()}`;
  }

  function handleSubmit() {
    if (!query.trim()) return;
    fetch("/api/catalog/search/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }).catch(() => {});
    setFocused(false);
    router.push(buildSearchUrl());
  }

  function toggleType(key: string) {
    const next = new Set(activeTypes);
    if (next.has(key)) { if (next.size > 1) next.delete(key); } else { next.add(key); }
    setActiveTypes(next);
  }

  function toggleTag(tagId: number) {
    setSelectedTags((p) => p.includes(tagId) ? p.filter((id) => id !== tagId) : [...p, tagId]);
  }

  function addUser(u: UserOption) {
    if (!selectedUsers.some((s) => s.userId === u.userId)) setSelectedUsers((p) => [...p, u]);
    setUserQ(""); setUserSugg([]);
  }

  const hasFilters = activeTypes.size < ALL_TYPES.length || selectedTags.length > 0 || selectedUsers.length > 0;

  return (
    <div className="relative">
      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-2.5 bg-white border rounded-xl shadow-sm px-4 py-3 max-w-2xl transition-all ${focused ? "border-brand-purple ring-2 ring-brand-purple/15" : "border-line"}`}>
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] placeholder:text-muted"
          placeholder={t.dashboard.search.placeholder}
        />
        {query && (
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }} className="text-muted hover:text-ink text-lg leading-none">×</button>
        )}
        <button onMouseDown={(e) => e.preventDefault()} onClick={handleSubmit} className="btn btn-primary btn-sm !py-2 !px-4">{t.dashboard.search.button}</button>
      </div>

      {/* Active filter badges (shown when not focused) */}
      {!focused && hasFilters && (
        <div className="flex flex-wrap items-center gap-2 mt-2 max-w-2xl">
          <span className="text-[11px] text-muted">{t.dashboard.search.filtering}</span>
          {activeTypes.size < ALL_TYPES.length && [...activeTypes].map((t) => (
            <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple">{TYPE_LABEL[t]}</span>
          ))}
          {selectedTags.map((id) => {
            const tag = availableTags.find((t) => t.tagId === id);
            return tag ? <span key={id} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tag.colorHex + "22", color: tag.colorHex }}>{tag.tagName}</span> : null;
          })}
          {selectedUsers.map((u) => <span key={u.userId} className="text-[10px] text-muted">{u.fullName}</span>)}
          <button onClick={() => { setActiveTypes(new Set(ALL_TYPES)); setSelectedTags([]); setSelectedUsers([]); }} className="text-[10px] text-brand-purple hover:underline">{t.dashboard.search.clear}</button>
        </div>
      )}

      {/* ── Dropdown ─────────────────────────────────────────────────────── */}
      {focused && (
        <div className="absolute left-0 right-0 max-w-2xl mt-1 bg-white border border-line rounded-xl shadow-md z-30 overflow-hidden">

          {/* Filter panel */}
          <div className="px-4 pt-3 pb-2.5 border-b border-line-soft bg-canvas-soft space-y-2.5">
            {/* Asset type chips */}
            <div className="flex flex-wrap gap-1.5">
              {TYPE_CONFIG.map(({ key, label }) => (
                <button
                  key={key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleType(key)}
                  className={`inline-flex items-center px-3 py-1 rounded-md border text-xs font-semibold transition-colors ${
                    activeTypes.has(key)
                      ? "bg-brand-purple text-white border-brand-purple"
                      : "border-line text-ink-soft hover:border-brand-purple hover:text-brand-purple bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tags row */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted font-bold uppercase tracking-wide mr-0.5">{t.dashboard.search.tags}</span>
                {availableTags.slice(0, 12).map((tag) => {
                  const active = selectedTags.includes(tag.tagId);
                  return (
                    <button
                      key={tag.tagId}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleTag(tag.tagId)}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
                      style={active ? { background: tag.colorHex, color: "#fff", borderColor: tag.colorHex } : { borderColor: tag.colorHex, color: tag.colorHex, background: tag.colorHex + "18" }}
                    >
                      {tag.tagName}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Steward row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted font-bold uppercase tracking-wide mr-0.5">{t.dashboard.search.steward}</span>
              {selectedUsers.map((u) => (
                <span key={u.userId} className="inline-flex items-center gap-1 text-[11px] bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded-full font-semibold">
                  {u.fullName}
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSelectedUsers((p) => p.filter((x) => x.userId !== u.userId))} className="opacity-60 hover:opacity-100 leading-none">×</button>
                </span>
              ))}
              <div className="relative">
                <input
                  value={userQ}
                  onChange={(e) => setUserQ(e.target.value)}
                  onBlur={() => setTimeout(() => setUserSugg([]), 150)}
                  placeholder={t.dashboard.search.searchUser}
                  className="text-[11px] border border-line rounded-md px-2 py-0.5 bg-white outline-none focus:border-brand-purple w-28"
                />
                {userSugg.length > 0 && (
                  <div className="absolute top-full left-0 mt-0.5 bg-white border border-line rounded-md shadow z-10 w-48 max-h-36 overflow-y-auto">
                    {userSugg.map((u) => (
                      <button key={u.userId} onMouseDown={(e) => e.preventDefault()} onClick={() => addUser(u)} className="w-full text-left px-2.5 py-1.5 hover:bg-canvas text-[11px] border-b border-line-soft last:border-b-0">
                        <div className="font-semibold text-ink">{u.fullName}</div>
                        <div className="text-[10px] text-muted">{u.email}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live results */}
          {showResults && (
            <div className="max-h-56 overflow-y-auto">
              <div className="px-4 py-2 border-b border-line-soft text-[10px] uppercase tracking-wider text-muted font-bold">
                {loading ? t.dashboard.search.searching : `${results.length} ${results.length !== 1 ? t.dashboard.search.results : t.dashboard.search.result}`}
              </div>
              {results.length === 0 && !loading && (
                <div className="px-4 py-5 text-sm text-muted text-center">{t.dashboard.search.noResults} &ldquo;{query}&rdquo;</div>
              )}
              {results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setFocused(false); router.push(r.href); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-canvas text-left transition-colors border-b border-line-soft last:border-b-0"
                >
                  <span className="w-8 h-8 rounded-lg bg-canvas-soft border border-line flex items-center justify-center text-brand-navy shrink-0">
                    {RESULT_ICON[r.type] ?? <TableIcon />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink truncate">{r.name}</span>
                      <span className="text-[10px] text-muted bg-canvas-soft px-1.5 py-0.5 rounded shrink-0">{TYPE_LABEL[r.type] ?? r.type}</span>
                    </div>
                    {(r.meta || r.description) && (
                      <div className="text-[11px] text-muted truncate">{r.meta}{r.meta && r.description ? " · " : ""}{r.description}</div>
                    )}
                  </div>
                </button>
              ))}
              {!loading && results.length > 0 && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSubmit}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold text-brand-purple hover:bg-canvas border-t border-line transition-colors"
                >
                  {t.dashboard.search.seeAll} &ldquo;{query}&rdquo;
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z" clipRule="evenodd" /></svg>
                </button>
              )}
            </div>
          )}

          {/* History (empty query) */}
          {showHistory && (recentSearches.length > 0 || recentAssets.length > 0) && (
            <div>
              {recentSearches.length > 0 && (
                <div className="px-4 py-2.5 border-b border-line-soft">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-2 font-bold">{t.dashboard.search.recentSearches}</div>
                  {recentSearches.map((q) => (
                    <button key={q} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(q); search(q); }} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-canvas text-sm text-ink-soft hover:text-ink transition-colors text-left w-full">
                      <ClockIcon /><span>{q}</span>
                    </button>
                  ))}
                </div>
              )}
              {recentAssets.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-3 font-bold">{t.dashboard.search.recentlyVisited} ({recentAssets.length})</div>
                  <div className="grid grid-cols-5 gap-2">
                    {recentAssets.map((a) => (
                      <Link key={`${a.assetType}-${a.assetId}`} href={a.href} onMouseDown={(e) => e.preventDefault()} onClick={() => setFocused(false)} className="flex flex-col items-center gap-1.5 group">
                        <div className="w-12 h-12 rounded-xl bg-canvas border border-line flex items-center justify-center text-brand-navy group-hover:border-brand-purple group-hover:bg-brand-purple/5 transition-colors">
                          <AssetIcon type={a.assetType} />
                        </div>
                        <div className="text-center">
                          <div className="text-[11px] font-semibold text-ink truncate max-w-[48px]">{a.assetName}</div>
                          {fmtCount(a.rowCount) && <div className="text-[10px] text-muted">{fmtCount(a.rowCount)}</div>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Static shortcuts (not focused) */}
      {!focused && recentAssets.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {recentAssets.map((a) => (
            <Link key={`${a.assetType}-${a.assetId}`} href={a.href} className="flex flex-col items-center gap-1 text-ink-soft hover:text-brand-purple transition-colors">
              <span className="w-10 h-10 grid place-items-center bg-white/70 border border-white rounded-lg text-brand-navy">
                <AssetIcon type={a.assetType} />
              </span>
              <span className="text-[11px] font-medium truncate max-w-[56px]">{a.assetName}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
