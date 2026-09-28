"use client";

import { useState, useEffect } from "react";

export type EntitySearchResult = { entityId: number; entityName: string; schemaName: string; sourceName: string };

// Table search box with an optional "PII only" filter, shared by the legal
// hold driving-table picker and the retention category table picker — both
// need the exact same "search catalog tables, narrow to PII-containing
// ones" behavior against /api/catalog/entities.
export function EntitySearchPicker({
  onSelect, showPiiFilter = false,
}: { onSelect: (e: EntitySearchResult) => void; showPiiFilter?: boolean }) {
  const [query, setQuery] = useState("");
  const [piiOnly, setPiiOnly] = useState(false);
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ search: query });
      if (piiOnly) params.set("piiOnly", "true");
      fetch(`/api/catalog/entities?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => { setResults(rows); setOpen(true); })
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, piiOnly]);

  return (
    <div className="relative">
      {showPiiFilter && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted mb-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={piiOnly} onChange={(e) => setPiiOnly(e.target.checked)} />
          PII columns only
        </label>
      )}
      <input
        className="input-sm w-full"
        placeholder="Search tables…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {results.map((e) => (
            <button
              key={e.entityId}
              onMouseDown={() => { onSelect(e); setQuery(""); setResults([]); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-canvas-soft border-b border-line-soft last:border-b-0"
            >
              <div className="text-[12px] font-medium text-ink">{e.entityName}</div>
              <div className="text-[10px] text-muted">{e.sourceName} · {e.schemaName}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
