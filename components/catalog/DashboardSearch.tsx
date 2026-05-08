"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import type { RecentAsset } from "@/lib/types";

type Props = {
  recentAssets:   RecentAsset[];
  recentSearches: string[];
};

function TableIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function ColumnIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>; }
function GlossaryIcon(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>; }
function SearchIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ClockIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></svg>; }

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
  const [focused, setFocused] = useState(false);
  const [query, setQuery]     = useState("");
  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapperRef= useRef<HTMLDivElement>(null);

  const showHistory = focused && query.length === 0;

  return (
    <div ref={wrapperRef} className="relative">
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
          className="flex-1 bg-transparent border-0 outline-none text-[15px] placeholder:text-muted"
          placeholder="Search for Tables, Databases, Schemas…"
        />
        {query && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="text-muted hover:text-ink text-lg leading-none"
          >×</button>
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          className="btn btn-primary btn-sm !py-2 !px-4"
        >
          Search
        </button>
      </div>

      {/* History dropdown */}
      {showHistory && (recentSearches.length > 0 || recentAssets.length > 0) && (
        <div className="absolute left-0 right-0 max-w-2xl mt-1 bg-white border border-line rounded-xl shadow-md z-30 overflow-hidden">
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

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="px-4 py-2 border-b border-line-soft">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Recent Searches</div>
              <div className="flex flex-col gap-0.5">
                {recentSearches.map((q) => (
                  <button
                    key={q}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setQuery(q); setFocused(false); }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-canvas text-sm text-ink-soft hover:text-ink transition-colors text-left"
                  >
                    <ClockIcon />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent assets */}
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
