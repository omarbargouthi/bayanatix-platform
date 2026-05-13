"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type BrowseSource = { id: number; name: string; dbType: string | null; dbName: string | null };
type BrowseSchema = { id: number; name: string; tableCount: number };
type BrowseTable  = { id: number; name: string; isView: boolean; rowCount: number | null; colCount: number };
type BrowseColumn = { id: number; name: string; dataType: string | null; isPk: boolean; isNullable: boolean; nullPct: number | null };

export type SelectedAsset = {
  assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES";
  assetId: number;
  assetName: string;
  path: string;
  breadcrumb: string[];
};

type SelectionMode = "table" | "column";

type Props = {
  selected: SelectedAsset[];
  onChange: (assets: SelectedAsset[]) => void;
  /** Lock browser to columns of this entity (used from Table DQ tab) */
  preFilterEntityId?: number;
  preFilterEntityName?: string;
  /** Initial mode if nothing is selected yet */
  defaultMode?: SelectionMode;
  onClose: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRows(n: number | null) {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function PkBadge() {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-purple/10 text-brand-purple border border-brand-purple/20">
      PK
    </span>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-2 py-1.5 border-b border-line bg-white">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter…"
        className="w-full text-[11px] px-2 py-1 border border-line rounded bg-canvas-soft outline-none focus:border-brand-purple/60 focus:bg-white transition-colors"
      />
    </div>
  );
}

function ColPane<T>({
  title, items, activeId, onSelect, loading, renderItem, headerExtra, search, onSearch,
}: {
  title: string;
  items: T[];
  activeId: number | null;
  onSelect: (item: T) => void;
  loading: boolean;
  renderItem: (item: T, active: boolean) => React.ReactNode;
  headerExtra?: React.ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col border-r border-line last:border-r-0 w-[200px] shrink-0">
      <div className="px-3 py-2 bg-canvas-soft border-b border-line text-[10px] uppercase tracking-wider font-bold text-muted flex items-center justify-between">
        <span>{title}</span>
        {headerExtra}
      </div>
      {onSearch && <SearchInput value={search ?? ""} onChange={onSearch} />}
      <div className="flex-1 overflow-y-auto nice-scroll">
        {loading && <div className="px-3 py-4 text-xs text-muted">Loading…</div>}
        {!loading && items.length === 0 && <div className="px-3 py-4 text-xs text-muted">None found</div>}
        {!loading && items.map((item) => {
          const id = (item as { id: number }).id;
          const active = id === activeId;
          return (
            <div
              key={id}
              onClick={() => onSelect(item)}
              className={`cursor-pointer px-3 py-2 border-b border-line-soft last:border-b-0 hover:bg-canvas transition-colors ${
                active ? "bg-brand-purple/8 border-l-2 border-l-brand-purple" : ""
              }`}
            >
              {renderItem(item, active)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AssetPicker({
  selected, onChange, preFilterEntityId, preFilterEntityName, defaultMode, onClose,
}: Props) {

  const initialMode: SelectionMode =
    selected.length > 0
      ? (selected[0].assetType === "DATA_ENTITIES" ? "table" : "column")
      : defaultMode ?? (preFilterEntityId ? "column" : "table");

  const [selectionMode, setSelectionMode] = useState<SelectionMode>(initialMode);

  const [sources, setSources] = useState<BrowseSource[]>([]);
  const [schemas, setSchemas] = useState<BrowseSchema[]>([]);
  const [tables,  setTables]  = useState<BrowseTable[]>([]);
  const [columns, setColumns] = useState<BrowseColumn[]>([]);

  const [activeSource, setActiveSource] = useState<BrowseSource | null>(null);
  const [activeSchema, setActiveSchema] = useState<BrowseSchema | null>(null);
  const [activeTable,  setActiveTable]  = useState<BrowseTable | null>(null);

  const [loadingSrc, setLoadingSrc] = useState(!preFilterEntityId);
  const [loadingSch, setLoadingSch] = useState(false);
  const [loadingTbl, setLoadingTbl] = useState(false);
  const [loadingCol, setLoadingCol] = useState(false);

  const [searchSrc, setSearchSrc] = useState("");
  const [searchSch, setSearchSch] = useState("");
  const [searchTbl, setSearchTbl] = useState("");
  const [searchCol, setSearchCol] = useState("");

  const [preFilterContext, setPreFilterContext] = useState<{ sourceName: string; schemaName: string } | null>(null);

  // ── Load on mount ──
  useEffect(() => {
    if (preFilterEntityId) {
      setLoadingCol(true);
      fetch(`/api/catalog/browse?type=columns&entityId=${preFilterEntityId}`)
        .then((r) => r.json())
        .then((d) => { setColumns(d); setLoadingCol(false); })
        .catch(() => setLoadingCol(false));

      fetch(`/api/catalog/entities/${preFilterEntityId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((entity) => {
          if (!entity) return;
          setPreFilterContext({ sourceName: entity.sourceName ?? "—", schemaName: entity.schemaName ?? "—" });
        })
        .catch(() => {});
      return;
    }
    fetch("/api/catalog/browse?type=sources")
      .then((r) => r.json())
      .then((d) => { setSources(d); setLoadingSrc(false); })
      .catch(() => setLoadingSrc(false));
  }, [preFilterEntityId]);

  // ── Navigation helpers ──

  // ── Derived: search-filtered lists ──
  const q = (s: string) => s.toLowerCase();
  const filteredSources = sources.filter((s) => !searchSrc || s.name.toLowerCase().includes(q(searchSrc)));
  const filteredSchemas = schemas.filter((s) => !searchSch || s.name.toLowerCase().includes(q(searchSch)));
  const filteredTables  = tables.filter((t)  => !searchTbl || t.name.toLowerCase().includes(q(searchTbl)));
  const filteredColumns = columns.filter((c) => !searchCol || c.name.toLowerCase().includes(q(searchCol)));

  function loadColumnsForTable(table: BrowseTable) {
    setActiveTable(table);
    setColumns([]);
    setSearchCol("");
    setLoadingCol(true);
    fetch(`/api/catalog/browse?type=columns&entityId=${table.id}`)
      .then((r) => r.json())
      .then((d) => { setColumns(d); setLoadingCol(false); })
      .catch(() => setLoadingCol(false));
  }

  function selectSource(src: BrowseSource) {
    setActiveSource(src);
    setActiveSchema(null);
    setActiveTable(null);
    setSchemas([]);
    setTables([]);
    setColumns([]);
    setSearchSch("");
    setSearchTbl("");
    setSearchCol("");
    setLoadingSch(true);
    fetch(`/api/catalog/browse?type=schemas&sourceId=${src.id}`)
      .then((r) => r.json())
      .then((d) => { setSchemas(d); setLoadingSch(false); })
      .catch(() => setLoadingSch(false));
  }

  function selectSchema(schema: BrowseSchema) {
    setActiveSchema(schema);
    setActiveTable(null);
    setTables([]);
    setColumns([]);
    setSearchTbl("");
    setSearchCol("");
    setLoadingTbl(true);
    fetch(`/api/catalog/browse?type=tables&schemaId=${schema.id}`)
      .then((r) => r.json())
      .then((d) => { setTables(d); setLoadingTbl(false); })
      .catch(() => setLoadingTbl(false));
  }

  function switchMode(mode: SelectionMode) {
    if (mode === selectionMode) return;
    setSelectionMode(mode);
    onChange([]); // clear selection only — keep navigation state intact
  }

  // ── Selection helpers ──

  function isTableSelected(table: BrowseTable) {
    return selected.some((s) => s.assetType === "DATA_ENTITIES" && s.assetId === table.id);
  }

  function isColumnSelected(col: BrowseColumn) {
    return selected.some((s) => s.assetType === "DATA_ATTRIBUTES" && s.assetId === col.id);
  }

  function toggleTable(table: BrowseTable) {
    // Always load columns when interacting with a table (for reference in table mode)
    if (activeTable?.id !== table.id) {
      loadColumnsForTable(table);
    }
    if (isTableSelected(table)) {
      onChange(selected.filter((s) => !(s.assetType === "DATA_ENTITIES" && s.assetId === table.id)));
    } else {
      const crumb = [activeSource?.name, activeSchema?.name, table.name].filter(Boolean) as string[];
      onChange([...selected, {
        assetType: "DATA_ENTITIES",
        assetId: table.id,
        assetName: table.name,
        path: crumb.join(" / "),
        breadcrumb: crumb,
      }]);
    }
  }

  function toggleColumn(col: BrowseColumn) {
    if (isColumnSelected(col)) {
      onChange(selected.filter((s) => !(s.assetType === "DATA_ATTRIBUTES" && s.assetId === col.id)));
    } else {
      const tableName  = preFilterEntityName ?? activeTable?.name ?? "—";
      const sourceName = preFilterContext?.sourceName ?? activeSource?.name ?? "—";
      const schemaName = preFilterContext?.schemaName ?? activeSchema?.name ?? "—";
      const crumb = [sourceName, schemaName, tableName, col.name];
      onChange([...selected, {
        assetType: "DATA_ATTRIBUTES",
        assetId: col.id,
        assetName: col.name,
        path: crumb.join(" / "),
        breadcrumb: crumb,
      }]);
    }
  }

  function selectAllColumns() {
    const existing = new Set(selected.filter((s) => s.assetType === "DATA_ATTRIBUTES").map((s) => s.assetId));
    const tableName  = preFilterEntityName ?? activeTable?.name ?? "—";
    const sourceName = preFilterContext?.sourceName ?? activeSource?.name ?? "—";
    const schemaName = preFilterContext?.schemaName ?? activeSchema?.name ?? "—";
    const toAdd: SelectedAsset[] = columns
      .filter((c) => !existing.has(c.id))
      .map((c) => ({
        assetType: "DATA_ATTRIBUTES" as const,
        assetId: c.id,
        assetName: c.name,
        path: [sourceName, schemaName, tableName, c.name].join(" / "),
        breadcrumb: [sourceName, schemaName, tableName, c.name],
      }));
    onChange([...selected, ...toAdd]);
  }

  function clearAllColumns() {
    const colIds = new Set(columns.map((c) => c.id));
    onChange(selected.filter((s) => !(s.assetType === "DATA_ATTRIBUTES" && colIds.has(s.assetId))));
  }

  function removeSelected(asset: SelectedAsset) {
    onChange(selected.filter((s) => !(s.assetType === asset.assetType && s.assetId === asset.assetId)));
  }

  const showColumnSelectAll =
    selectionMode === "column" && filteredColumns.length > 0 && (activeTable != null || !!preFilterEntityId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl border border-line flex flex-col w-[880px] max-h-[84vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-bold text-ink">Select Assets</h2>
            <p className="text-[11px] text-muted mt-0.5">Navigate the catalog hierarchy, then check assets to include</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none ml-4">&times;</button>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-4 px-5 py-3 bg-canvas-soft border-b border-line shrink-0">
          <span className="text-xs font-semibold text-muted shrink-0">Apply rule at:</span>
          <div className="flex rounded-lg border border-line overflow-hidden text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => switchMode("table")}
              className={`px-4 py-1.5 transition-colors ${
                selectionMode === "table" ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas"
              }`}
            >
              Table level
            </button>
            <button
              type="button"
              onClick={() => switchMode("column")}
              className={`px-4 py-1.5 transition-colors border-l border-line ${
                selectionMode === "column" ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas"
              }`}
            >
              Column level
            </button>
          </div>
          <span className="text-[11px] text-muted">
            {selectionMode === "table"
              ? "Row counts, freshness, table-wide checks — check tables below"
              : "Nulls, patterns, ranges, referential checks — check columns below"}
          </span>
        </div>

        {/* Column browser */}
        <div className="flex flex-1 overflow-hidden border-b border-line" style={{ minHeight: 0 }}>

          {/* Sources — hidden in preFilter mode */}
          {!preFilterEntityId && (
            <ColPane
              title="Source"
              items={filteredSources}
              activeId={activeSource?.id ?? null}
              loading={loadingSrc}
              onSelect={selectSource}
              search={searchSrc}
              onSearch={setSearchSrc}
              renderItem={(src, active) => (
                <div>
                  <div className={`text-[12px] font-semibold truncate ${active ? "text-brand-purple" : "text-ink"}`}>{src.name}</div>
                  {src.dbName && <div className="text-[10px] text-muted truncate">{src.dbName}</div>}
                  {src.dbType && <div className="text-[10px] text-muted">{src.dbType}</div>}
                </div>
              )}
            />
          )}

          {/* Schemas — hidden in preFilter mode */}
          {!preFilterEntityId && (
            <ColPane
              title="Schema"
              items={filteredSchemas}
              activeId={activeSchema?.id ?? null}
              loading={loadingSch}
              onSelect={selectSchema}
              search={searchSch}
              onSearch={activeSource ? setSearchSch : undefined}
              renderItem={(sch, active) => (
                <div>
                  <div className={`text-[12px] font-semibold truncate ${active ? "text-brand-purple" : "text-ink"}`}>{sch.name}</div>
                  <div className="text-[10px] text-muted">{sch.tableCount} tables</div>
                </div>
              )}
            />
          )}

          {/* Tables — hidden in preFilter mode */}
          {!preFilterEntityId && (
            <div className="flex flex-col border-r border-line w-[200px] shrink-0">
              <div className="px-3 py-2 bg-canvas-soft border-b border-line text-[10px] uppercase tracking-wider font-bold text-muted">
                Table / View
              </div>
              {activeSchema && <SearchInput value={searchTbl} onChange={setSearchTbl} />}
              <div className="flex-1 overflow-y-auto nice-scroll">
                {loadingTbl && <div className="px-3 py-4 text-xs text-muted">Loading…</div>}
                {!loadingTbl && filteredTables.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted">
                    {activeSchema ? (searchTbl ? "No match" : "No tables") : "Select a schema"}
                  </div>
                )}
                {!loadingTbl && filteredTables.map((tbl) => {
                  const checked = isTableSelected(tbl);
                  const active  = activeTable?.id === tbl.id;
                  return (
                    <div
                      key={tbl.id}
                      onClick={() => loadColumnsForTable(tbl)}
                      className={`flex items-start gap-2.5 px-3 py-2 border-b border-line-soft last:border-b-0 hover:bg-canvas transition-colors cursor-pointer ${
                        active ? "bg-brand-purple/5 border-l-2 border-l-brand-purple" : ""
                      }`}
                    >
                      {selectionMode === "table" ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => { e.stopPropagation(); toggleTable(tbl); }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 w-3.5 h-3.5 accent-brand-purple shrink-0"
                        />
                      ) : (
                        <span className="mt-1 text-[10px] text-brand-purple shrink-0">›</span>
                      )}
                      <div className="min-w-0">
                        <div className={`text-[12px] font-semibold truncate ${active ? "text-brand-purple" : "text-ink"}`}>
                          {tbl.name}
                        </div>
                        <div className="text-[10px] text-muted">
                          {tbl.isView ? "View" : "Table"}
                          {tbl.rowCount != null ? ` · ${fmtRows(tbl.rowCount)} rows` : ""}
                          {tbl.colCount > 0 ? ` · ${tbl.colCount} cols` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Columns pane */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="px-3 py-2 bg-canvas-soft border-b border-line text-[10px] uppercase tracking-wider font-bold text-muted flex items-center justify-between shrink-0">
              <span>
                {preFilterEntityId
                  ? preFilterEntityName ?? "Columns"
                  : activeTable ? `${activeTable.name} — Columns` : "Columns"}
              </span>
              {showColumnSelectAll && (
                <div className="flex items-center gap-3">
                  <button onClick={selectAllColumns} className="text-[10px] text-brand-purple hover:underline">All</button>
                  <button onClick={clearAllColumns} className="text-[10px] text-muted hover:underline">None</button>
                </div>
              )}
            </div>
            {(activeTable || preFilterEntityId) && columns.length > 0 && (
              <SearchInput value={searchCol} onChange={setSearchCol} />
            )}
            <div className="flex-1 overflow-y-auto nice-scroll">
              {loadingCol && <div className="px-3 py-4 text-xs text-muted">Loading…</div>}
              {!loadingCol && filteredColumns.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted">
                  {(activeTable || preFilterEntityId)
                    ? (searchCol ? "No columns match" : "No columns found")
                    : selectionMode === "column"
                      ? "Click a table to browse its columns"
                      : "Click a table to preview its columns"}
                </div>
              )}
              {!loadingCol && filteredColumns.map((col) => (
                selectionMode === "column" ? (
                  <label
                    key={col.id}
                    className="flex items-start gap-2.5 px-3 py-2 border-b border-line-soft last:border-b-0 hover:bg-canvas transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isColumnSelected(col)}
                      onChange={() => toggleColumn(col)}
                      className="mt-0.5 w-3.5 h-3.5 accent-brand-purple shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[12px] font-semibold truncate ${isColumnSelected(col) ? "text-brand-purple" : "text-ink"}`}>
                          {col.name}
                        </span>
                        {col.isPk && <PkBadge />}
                      </div>
                      <div className="text-[10px] text-muted flex items-center gap-2">
                        {col.dataType && <span className="font-mono">{col.dataType}</span>}
                        {col.nullPct != null && <span>null: {col.nullPct.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </label>
                ) : (
                  /* Table mode: columns are read-only reference info */
                  <div key={col.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-line-soft last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-ink-soft truncate">{col.name}</span>
                        {col.isPk && <PkBadge />}
                      </div>
                      {col.dataType && <span className="text-[10px] text-muted font-mono">{col.dataType}</span>}
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Selected chips */}
        <div className="px-5 py-3 shrink-0 min-h-[72px] max-h-[140px] overflow-y-auto border-b border-line">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
              Selected ({selected.length})
            </span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[11px] text-red-500 hover:underline">Clear all</button>
            )}
          </div>
          {selected.length === 0 ? (
            <p className="text-xs text-muted">
              {selectionMode === "table" ? "Check tables above." : "Check columns above."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((a) => (
                <div
                  key={`${a.assetType}-${a.assetId}`}
                  className="flex items-center gap-1.5 bg-canvas-soft border border-line rounded-md pl-2.5 pr-1.5 py-1 text-[11px]"
                >
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    a.assetType === "DATA_ENTITIES" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}>
                    {a.assetType === "DATA_ENTITIES" ? "TABLE" : "COL"}
                  </span>
                  {a.breadcrumb.length > 1 && (
                    <span className="text-muted text-[10px] hidden sm:inline">
                      {a.breadcrumb.slice(0, -1).join(" › ")} ›{" "}
                    </span>
                  )}
                  <span className="font-semibold text-ink">{a.assetName}</span>
                  <button
                    onClick={() => removeSelected(a)}
                    className="ml-0.5 text-muted hover:text-red-500 text-sm leading-none"
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-canvas-soft shrink-0 rounded-b-xl">
          <span className="text-[11px] text-muted">
            {selected.length === 0
              ? `Select at least one ${selectionMode}`
              : `${selected.length} ${selectionMode}${selected.length !== 1 ? "s" : ""} selected — will create ${selected.length} rule${selected.length !== 1 ? "s" : ""}`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-sm">Cancel</button>
            <button onClick={onClose} disabled={selected.length === 0} className="btn btn-primary btn-sm">
              Apply Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
