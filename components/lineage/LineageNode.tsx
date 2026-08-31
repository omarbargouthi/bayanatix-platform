"use client";

import { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import type { I18nStrings } from "@/lib/i18n/strings";

export function layerLabels(t: I18nStrings["lineage"]): Record<string, string> {
  return {
    SOURCE: t.layers.source, RAW: t.layers.raw, STAGING: t.layers.staging,
    TABLE: t.layers.table, VIEW: t.layers.view, LAKEHOUSE: t.layers.lakehouse,
    SEMANTIC_MODEL: t.layers.semanticModel, REPORT: t.layers.report,
  };
}

export const LAYER_COLORS: Record<string, string> = {
  SOURCE:          "bg-slate-100 text-slate-600",
  RAW:             "bg-sky-100 text-sky-700",
  STAGING:         "bg-purple-100 text-purple-700",
  TABLE:           "bg-indigo-100 text-indigo-700",
  VIEW:            "bg-teal-100 text-teal-700",
  LAKEHOUSE:       "bg-cyan-100 text-cyan-700",
  SEMANTIC_MODEL:  "bg-amber-100 text-amber-700",
  REPORT:          "bg-orange-100 text-orange-700",
};

export const LAYER_DOT: Record<string, string> = {
  SOURCE: "bg-slate-400", RAW: "bg-sky-500", STAGING: "bg-purple-500", TABLE: "bg-indigo-500", VIEW: "bg-teal-500",
  LAKEHOUSE: "bg-cyan-500", SEMANTIC_MODEL: "bg-amber-500", REPORT: "bg-orange-500",
};

// Engine glyph — small colored monogram badge showing which system a node's
// data_sources row belongs to, so a multi-system graph is scannable at a glance.
export function engineLabels(t: I18nStrings["lineage"]): Record<string, string> {
  return {
    ORACLE: t.engines.oracle, MSSQL: t.engines.mssql, POSTGRES: t.engines.postgres,
    POWERBI: t.engines.powerbi, FABRIC: t.engines.fabric,
  };
}

const ENGINE_GLYPH: Record<string, { mono: string; color: string }> = {
  ORACLE:   { mono: "OR",  color: "bg-red-600" },
  MSSQL:    { mono: "MS",  color: "bg-blue-700" },
  POSTGRES: { mono: "PG",  color: "bg-sky-700" },
  POWERBI:  { mono: "BI",  color: "bg-amber-600" },
  FABRIC:   { mono: "FB",  color: "bg-purple-700" },
};

export function EngineGlyph({ engineCode, label }: { engineCode: string | null; label?: string }) {
  const g = engineCode ? ENGINE_GLYPH[engineCode] : null;
  if (!g) return null;
  return (
    <span
      title={label ?? engineCode ?? undefined}
      className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white ${g.color}`}
    >
      {g.mono}
    </span>
  );
}

export type LineageNodeColumn = { attributeId: number; name: string };

export type LineageNodeData = {
  entityId: number;
  entityName: string;
  layerCode: string | null;
  sourceTypeCode: string | null;
  qualityStatus: string;
  hasUpstreamIssue: boolean;
  isCurrent: boolean;
  columnCount: number;
  columns: LineageNodeColumn[]; // columns on the traced path (attribute-level scope)
  scope: "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";
  onSelectColumn: (entityId: number, attributeId: number, name: string) => void;
  t: I18nStrings["lineage"];
};

export function LineageNodeCard({ data }: { data: LineageNodeData }) {
  const [expanded, setExpanded] = useState(false);
  const [allColumns, setAllColumns] = useState<{ attributeId: number; name: string; qualityStatus: string; attributeClassCode: string | null }[] | null>(null);
  const [loadingCols, setLoadingCols] = useState(false);
  const labels = layerLabels(data.t);

  useEffect(() => {
    if (!expanded || allColumns !== null) return;
    setLoadingCols(true);
    fetch(`/api/lineage/entities/${data.entityId}/columns`)
      .then((r) => r.json())
      .then((rows) => setAllColumns(Array.isArray(rows) ? rows : []))
      .finally(() => setLoadingCols(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const focusedColumn = data.scope === "ATTRIBUTE_LEVEL" ? data.columns[0] : null;

  return (
    <div
      className={`relative rounded-xl border-2 bg-white shadow-sm px-3 py-2.5 w-[210px] ${
        data.isCurrent ? "border-brand-purple shadow-md" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2 !border-0" />

      {data.isCurrent && (
        <div className="absolute -top-6 left-0 text-[10px] font-bold text-white bg-brand-purple px-2 py-0.5 rounded-full whitespace-nowrap">
          {data.t.currentAsset}
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        <span className="text-sky-500 text-sm shrink-0">▤</span>
        <span className="text-sm font-semibold text-brand-purple truncate flex-1 min-w-0">{data.entityName}</span>
        <EngineGlyph engineCode={data.sourceTypeCode} label={engineLabels(data.t)[data.sourceTypeCode ?? ""]} />
        <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${LAYER_COLORS[data.layerCode ?? ""] ?? "bg-slate-100 text-slate-500"}`}>
          {labels[data.layerCode ?? ""] ?? data.layerCode ?? "—"}
        </span>
      </div>

      {focusedColumn && (
        <div className="text-[11px] text-slate-400 mb-1.5 truncate">{focusedColumn.name}</div>
      )}

      <div className="flex items-center gap-2 mt-1">
        {(data.qualityStatus === "CRITICAL" || data.qualityStatus === "WARNING") && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${data.qualityStatus === "CRITICAL" ? "bg-red-500" : "bg-amber-500"}`}
            title={`${data.t.detail.quality}: ${data.qualityStatus === "CRITICAL" ? data.t.quality.critical : data.t.quality.warning}`}
          />
        )}
        {data.hasUpstreamIssue && (
          <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-500 shrink-0" title="Upstream DQ issue in this lineage path" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="text-[10px] text-slate-400 hover:text-brand-purple ml-auto transition-colors"
        >
          {data.columnCount} {data.t.detail.columns} {expanded ? "︿" : "⌄"}
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-0.5 max-h-32 overflow-y-auto nice-scroll">
          {loadingCols && <div className="text-[10px] text-slate-400 py-1">{data.t.loadingColumns}</div>}
          {allColumns?.map((c) => (
            <button
              key={c.attributeId}
              onClick={(e) => { e.stopPropagation(); data.onSelectColumn(data.entityId, c.attributeId, c.name); }}
              className="flex items-center gap-1.5 w-full text-left text-[10px] text-slate-500 hover:text-brand-purple truncate py-0.5"
            >
              {(c.qualityStatus === "CRITICAL" || c.qualityStatus === "WARNING") && (
                <span className={`w-1 h-1 rounded-full shrink-0 ${c.qualityStatus === "CRITICAL" ? "bg-red-500" : "bg-amber-500"}`} />
              )}
              {c.attributeClassCode === "MEASURE" && (
                <span className="text-amber-600 font-bold shrink-0" title="DAX measure">ƒx</span>
              )}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
