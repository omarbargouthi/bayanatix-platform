"use client";

import { useState, useEffect, useRef } from "react";

type TableRow = { id: number; name: string; schemaName: string; sourceName: string };
type ColRow   = { id: number; name: string; dataType: string | null };

type Props = {
  refTable:  string;
  refColumn: string;
  onChange:  (refTable: string, refColumn: string) => void;
};

export function RefIntegrityPicker({ refTable, refColumn, onChange }: Props) {
  const [tableSearch,  setTableSearch]  = useState("");
  const [tables,       setTables]       = useState<TableRow[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableOpen,    setTableOpen]    = useState(false);

  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [colSearch,  setColSearch]  = useState("");
  const [columns,    setColumns]    = useState<ColRow[]>([]);
  const [colLoading, setColLoading] = useState(false);
  const [colOpen,    setColOpen]    = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);
  const colRef   = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setTableOpen(false);
      if (colRef.current   && !colRef.current.contains(e.target as Node))   setColOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Load tables when dropdown opens or search changes
  useEffect(() => {
    if (!tableOpen) return;
    setTableLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/catalog/browse?type=all-tables${tableSearch ? `&q=${encodeURIComponent(tableSearch)}` : ""}`)
        .then((r) => r.json())
        .then((d: TableRow[]) => { setTables(d); setTableLoading(false); })
        .catch(() => setTableLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [tableSearch, tableOpen]);

  // Load columns when an entity is chosen
  useEffect(() => {
    if (!selectedEntityId) return;
    setColLoading(true);
    fetch(`/api/catalog/browse?type=columns&entityId=${selectedEntityId}`)
      .then((r) => r.json())
      .then((d: ColRow[]) => { setColumns(d); setColLoading(false); })
      .catch(() => setColLoading(false));
  }, [selectedEntityId]);

  function selectTable(t: TableRow) {
    const val = `${t.schemaName}.${t.name}`;
    setSelectedEntityId(t.id);
    setColumns([]);
    setTableOpen(false);
    setTableSearch("");
    onChange(val, "");
  }

  function selectColumn(c: ColRow) {
    setColOpen(false);
    setColSearch("");
    onChange(refTable, c.name);
  }

  const filteredCols = columns.filter(
    (c) => !colSearch || c.name.toLowerCase().includes(colSearch.toLowerCase())
  );

  const canOpenCols = selectedEntityId != null || refTable !== "";

  return (
    <div className="col-span-2 grid grid-cols-2 gap-3">
      {/* ── Reference Table ── */}
      <div ref={tableRef} className="relative">
        <label className="block text-[11px] text-muted mb-1">Reference Table</label>
        <div
          onClick={() => setTableOpen((v) => !v)}
          className="input w-full cursor-pointer flex items-center justify-between text-sm select-none"
        >
          <span className={refTable ? "text-ink" : "text-muted/50 italic"}>
            {refTable || "Select table…"}
          </span>
          <span className="text-muted text-[10px] ml-2">▼</span>
        </div>
        {tableOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-xl flex flex-col max-h-56">
            <div className="p-2 border-b border-line shrink-0">
              <input
                autoFocus
                className="input w-full text-xs"
                placeholder="Search tables…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {tableLoading && <div className="px-3 py-3 text-xs text-muted">Loading…</div>}
              {!tableLoading && tables.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted">No tables found</div>
              )}
              {!tableLoading && tables.map((t) => (
                <div
                  key={t.id}
                  onMouseDown={() => selectTable(t)}
                  className="px-3 py-2 hover:bg-canvas-soft cursor-pointer border-b border-line-soft last:border-b-0"
                >
                  <span className="text-[10px] text-muted">{t.sourceName} › {t.schemaName} › </span>
                  <span className="text-[12px] font-semibold text-ink">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Reference Column ── */}
      <div ref={colRef} className="relative">
        <label className="block text-[11px] text-muted mb-1">Reference Column</label>
        <div
          onClick={() => canOpenCols && setColOpen((v) => !v)}
          className={`input w-full flex items-center justify-between text-sm select-none ${canOpenCols ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
        >
          <span className={refColumn ? "text-ink" : "text-muted/50 italic"}>
            {refColumn || "Select column…"}
          </span>
          <span className="text-muted text-[10px] ml-2">▼</span>
        </div>
        {colOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-xl flex flex-col max-h-48">
            <div className="p-2 border-b border-line shrink-0">
              <input
                autoFocus
                className="input w-full text-xs"
                placeholder="Filter columns…"
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {colLoading && <div className="px-3 py-3 text-xs text-muted">Loading…</div>}
              {!colLoading && filteredCols.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted">
                  {selectedEntityId ? "No columns found" : "Select a table first"}
                </div>
              )}
              {!colLoading && filteredCols.map((c) => (
                <div
                  key={c.id}
                  onMouseDown={() => selectColumn(c)}
                  className="px-3 py-2 hover:bg-canvas-soft cursor-pointer border-b border-line-soft last:border-b-0 flex items-center gap-2"
                >
                  <span className="text-[12px] font-semibold text-ink">{c.name}</span>
                  {c.dataType && <span className="text-[10px] font-mono text-muted">{c.dataType}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
