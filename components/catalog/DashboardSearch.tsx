"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecentAsset } from "@/lib/types";
import type { SearchResult } from "@/app/api/catalog/search/route";

type Props = {
  recentAssets:   RecentAsset[];
  recentSearches: string[];
};

function TableIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function ColumnIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function GlossaryIcon(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>; }
function SearchIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ClockIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></svg>; }

const TYPE_ICON: Record<string, React.ReactNode> = {
  TABLE:  <TableIcon />,
  COLUMN: <ColumnIcon />,
  SCHEMA: <GlossaryIcon />,
  SOURCE: <GlossaryIcon />,
};

const TYPE_LABEL: Record<string, string> = {
  TABLE: "Table", COLUMN: "Column", SCHEMA: "Schema", SOURCE: "Source",
};

function fmtCount(n: number | null) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function AssetIcon({ type }: { type: string }) {
  if (type === "COLUMN")  return <ColumnIcon />;
  if (type === "GLOSSARY")return <GlossaryIcon />;
  return <TableIcon />;
}

const FILTERS = ["Sort", "Domains", "Tags", "Stakeholder"];

export function DashboardSearch({ recentAssets, recentSearches }: Props) {
  const router = useRouter();
  const [focused,  setFocused]  = useState(false);
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef= useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHistory = focused && query.length === 0;
  const showResults = focused && query.length >= 2;

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

  function handleSubmit() {
    if (!query.trim()) return;
    fetch("/api/catalog/search/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }).catch(() => {});
    setFocused(false);
    router.push(`/catalog?q=${encodeURIComponent(query.trim())}`);
  }

  function pickResult(href: string) {
    setFocused(false);
    router.push(href);
  }

  return (
    <div className="relative">
      {/* Search bar */}
      <div
        className={`flex items-center gap-2.5 bg-white border rounded-xl shadow-sm px-4 py-3 max-w-2xl transition-all ${
          focused ? "border-brand-purple ring-2 ring-brand-purple/15" : "border-line"
        }`}
      >
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] placeholder:text-muted"
          placeholder="Search for Tables, Databases, Schemas…"
        />
        {query && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
            className="text-muted hover:text-ink text-lg leading-none"
          >×</button>
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSubmit}
          className="btn btn-primary btn-sm !py-2 !px-4"
        >
          Search
        </button>
      </div>

      {/* Dropdown */}
      {focused && (
        <div className="absolute left-0 right-0 max-w-2xl mt-1 bg-white border border-line rounded-xl shadow-md z-30 overflow-hidden">

          {/* Live search results */}
          {showResults && (
            <>
              <div className="px-4 py-2 border-b border-line-soft text-[10px] uppercase tracking-wider text-muted font-bold">
                {loading ? "Searching…" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
              </div>
              {results.length === 0 && !loading && (
                <div className="px-4 py-5 text-sm text-muted text-center">No results found for "{query}"</div>
              )}
              {results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickResult(r.href)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-canvas text-left transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-canvas-soft border border-line flex items-center justify-center text-brand-navy shrink-0">
                    {TYPE_ICON[r.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink truncate">{r.name}</span>
                      <span className="text-[10px] text-muted bg-canvas-soft px-1.5 py-0.5 rounded shrink-0">{TYPE_LABEL[r.type]}</span>
                    </div>
                    {(r.meta || r.description) && (
                      <div className="text-[11px] text-muted truncate">{r.meta}{r.meta && r.description ? " · " : ""}{r.description}</div>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}

          {/* History (shown when query is empty) */}
          {showHistory && (recentSearches.length > 0 || recentAssets.length > 0) && (
            <>
              {/* Filter chips */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-line-soft">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onMouseDown={(e) => e.preventDefault()}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-line text-xs font-semibold text-ink-soft hover:border-brand-purple hover:text-brand-purple transition-colors"
                  >
                    {f} <span className="opacity-60">▾</span>
                  </button>
                ))}
              </div>

              {recentSearches.length > 0 && (
                <div className="px-4 py-2 border-b border-line-soft">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Recent Searches</div>
                  {recentSearches.map((q) => (
                    <button
                      key={q}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setQuery(q); search(q); }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-canvas text-sm text-ink-soft hover:text-ink transition-colors text-left w-full"
                    >
                      <ClockIcon />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              )}

              {recentAssets.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Recently Visited</div>
                  <div className="flex gap-3 flex-wrap">
                    {recentAssets.map((a) => (
                      <Link
                        key={`${a.assetType}-${a.assetId}`}
                        href={a.href}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setFocused(false)}
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div className="w-14 h-14 rounded-xl bg-canvas border border-line flex items-center justify-center text-brand-navy group-hover:border-brand-purple group-hover:bg-brand-purple/5 transition-colors">
                          <AssetIcon type={a.assetType} />
                        </div>
                        <div className="text-center">
                          <div className="text-[11px] font-semibold text-ink truncate max-w-[56px]">{a.assetName}</div>
                          {fmtCount(a.rowCount) && (
                            <div className="text-[10px] text-muted">{fmtCount(a.rowCount)}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Static shortcuts (only shown when not focused) */}
      {!focused && (
        <div className="flex flex-wrap gap-4 mt-4">
          {recentAssets.slice(0, 6).map((a) => (
            <Link
              key={`${a.assetType}-${a.assetId}`}
              href={a.href}
              className="flex flex-col items-center gap-1 text-ink-soft hover:text-brand-purple transition-colors"
            >
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
