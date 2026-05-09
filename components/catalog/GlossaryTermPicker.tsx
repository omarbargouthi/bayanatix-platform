"use client";

import { useState, useEffect, useRef } from "react";
import type { GlossaryPickerDomain } from "@/app/api/glossary/picker/route";

const CLASS_DOT: Record<string, string> = {
  PUBLIC:       "bg-emerald-500",
  INTERNAL:     "bg-blue-500",
  CONFIDENTIAL: "bg-amber-500",
  RESTRICTED:   "bg-red-500",
  SECRET:       "bg-purple-500",
  TOP_SECRET:   "bg-red-800",
};

export function GlossaryTermPicker({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [domains,  setDomains]  = useState<GlossaryPickerDomain[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");
  const [activeDomain, setActiveDomain] = useState<GlossaryPickerDomain | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function openPicker() {
    setOpen(true);
    setSearch("");
    setActiveDomain(null);
    if (domains.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/glossary/picker");
      if (res.ok) setDomains(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function select(termName: string) {
    onChange(termName);
    setOpen(false);
  }

  const q = search.trim().toLowerCase();

  // Flat search across all domains
  const flatMatches = q
    ? domains.flatMap((d) =>
        d.terms
          .filter((t) => t.termName.toLowerCase().includes(q) || d.domainName.toLowerCase().includes(q))
          .map((t) => ({ ...t, domainName: d.domainName }))
      )
    : [];

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={openPicker}
        className="input-field text-left flex items-center justify-between gap-2 w-full"
      >
        <span className={value ? "text-ink" : "text-muted"}>
          {value || "Link to glossary term…"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              onKeyDown={(e) => e.key === "Enter" && onChange("")}
              className="text-muted hover:text-red-500 text-sm px-1 leading-none"
              aria-label="Clear"
            >
              ×
            </span>
          )}
          <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-line rounded-xl shadow-lg overflow-hidden">
          {/* Search bar */}
          <div className="px-3 py-2 border-b border-line-soft">
            <div className="flex items-center gap-2 bg-canvas rounded-md px-2.5 py-1.5">
              <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActiveDomain(null); }}
                placeholder="Search terms…"
                className="bg-transparent outline-none border-0 text-sm flex-1 placeholder-muted"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="py-8 text-center text-sm text-muted">Loading glossaries…</div>
            )}

            {!loading && q && (
              /* Flat search results */
              flatMatches.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">No terms match "{search}"</div>
              ) : (
                flatMatches.map((t) => (
                  <button
                    key={t.glossaryId}
                    type="button"
                    onClick={() => select(t.termName)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors"
                  >
                    {t.classCode && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[t.classCode.toUpperCase()] ?? "bg-gray-400"}`} />
                    )}
                    <span className="flex-1 text-sm text-ink">{t.termName}</span>
                    <span className="text-[11px] text-muted">{t.domainName}</span>
                    {t.isPii && (
                      <span className="text-[10px] font-bold text-red-600 border border-red-200 rounded px-1">PII</span>
                    )}
                  </button>
                ))
              )
            )}

            {!loading && !q && !activeDomain && (
              /* Domain list */
              domains.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">No glossary terms found</div>
              ) : (
                domains.map((d) => (
                  <button
                    key={d.glossaryId}
                    type="button"
                    onClick={() => setActiveDomain(d)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors"
                  >
                    <svg className="w-4 h-4 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    <span className="flex-1 text-sm font-medium text-ink">{d.domainName}</span>
                    <span className="text-[11px] text-muted">{d.terms.length} terms</span>
                    <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
                ))
              )
            )}

            {!loading && !q && activeDomain && (
              /* Term list inside a domain */
              <>
                <button
                  type="button"
                  onClick={() => setActiveDomain(null)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-line-soft text-sm text-muted hover:text-ink transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                  {activeDomain.domainName}
                </button>
                {activeDomain.terms.map((t) => (
                  <button
                    key={t.glossaryId}
                    type="button"
                    onClick={() => select(t.termName)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors"
                  >
                    {t.classCode && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[t.classCode.toUpperCase()] ?? "bg-gray-400"}`} />
                    )}
                    <span className="flex-1 text-sm text-ink">{t.termName}</span>
                    {t.isPii && (
                      <span className="text-[10px] font-bold text-red-600 border border-red-200 rounded px-1">PII</span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
