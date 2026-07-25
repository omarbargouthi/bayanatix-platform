"use client";

import { useEffect, useState } from "react";
import { LAYER_LABELS } from "./LineageNode";

type ImpactAsset = {
  depth: number; assetId: number; assetType: string; name: string;
  parentEntityName: string | null; schemaName: string | null; layerCode: string | null;
  ownerName: string | null; qualityStatus: string; transformationTypeName: string | null;
  transformationLogicText: string | null; processName: string | null;
};

type ImpactReport = {
  summary: { totalImpacted: number; byLayer: Record<string, number>; withDqIssues: number };
  levels: { depth: number; assets: ImpactAsset[] }[];
};

const QUALITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700", WARNING: "bg-amber-100 text-amber-700",
  GOOD: "bg-emerald-100 text-emerald-700", UNKNOWN: "bg-slate-100 text-slate-500",
};

function toCsv(report: ImpactReport, focusName: string, direction: "UP" | "DOWN"): string {
  const header = ["Hop", "Asset", "Type", "Layer", "Schema", "Owner", "Quality", "Transformation", "Process"];
  const rows = report.levels.flatMap((lvl) =>
    lvl.assets.map((a) => [
      String(lvl.depth),
      a.assetType === "DATA_ATTRIBUTES" ? `${a.parentEntityName}.${a.name}` : a.name,
      a.assetType === "DATA_ATTRIBUTES" ? "Column" : "Table",
      LAYER_LABELS[a.layerCode ?? ""] ?? a.layerCode ?? "",
      a.schemaName ?? "",
      a.ownerName ?? "",
      a.qualityStatus,
      a.transformationTypeName ?? "",
      a.processName ?? "",
    ]),
  );
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function ImpactReportPanel({
  assetType, assetId, focusName, direction, onClose,
}: {
  assetType: string; assetId: number; focusName: string; direction: "UP" | "DOWN"; onClose: () => void;
}) {
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/lineage/impact?assetType=${assetType}&assetId=${assetId}&direction=${direction}&maxDepth=10`)
      .then((r) => r.json())
      .then(setReport)
      .finally(() => setLoading(false));
  }, [assetType, assetId, direction]);

  function exportCsv() {
    if (!report) return;
    const csv = toCsv(report, focusName, direction);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lineage-impact-${direction.toLowerCase()}-${focusName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="w-[480px] max-w-full h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-sm text-slate-800">
              {direction === "DOWN" ? "Downstream Impact" : "Upstream Impact (Root Cause)"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">from {focusName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        {loading && <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Loading…</div>}

        {!loading && report && (
          <>
            <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-3 gap-2 shrink-0">
              <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                <div className="text-lg font-bold text-slate-800">{report.summary.totalImpacted}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium">Assets</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                <div className="text-lg font-bold text-slate-800">{Object.keys(report.summary.byLayer).length}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium">Layers</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                <div className={`text-lg font-bold ${report.summary.withDqIssues > 0 ? "text-red-600" : "text-slate-800"}`}>{report.summary.withDqIssues}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium">DQ Issues</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto nice-scroll px-5 py-3 space-y-4">
              {report.levels.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">No {direction === "DOWN" ? "downstream" : "upstream"} assets found.</p>
              )}
              {report.levels.map((lvl) => (
                <div key={lvl.depth}>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Hop {lvl.depth}</div>
                  <div className="space-y-1.5">
                    {lvl.assets.map((a, i) => (
                      <div key={`${a.assetId}-${i}`} className="border border-slate-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">
                            {a.assetType === "DATA_ATTRIBUTES" ? `${a.parentEntityName}.${a.name}` : a.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                            {LAYER_LABELS[a.layerCode ?? ""] ?? a.layerCode ?? "—"}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${QUALITY_COLORS[a.qualityStatus]}`}>{a.qualityStatus}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3">
                          {a.schemaName && <span>Schema: {a.schemaName}</span>}
                          <span>Owner: {a.ownerName ?? "—"}</span>
                          {a.processName && <span>via {a.processName}</span>}
                        </div>
                        {a.transformationTypeName && (
                          <div className="text-[10px] text-slate-400 mt-1">{a.transformationTypeName}{a.transformationLogicText ? ` — ${a.transformationLogicText}` : ""}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 shrink-0">
              <button onClick={exportCsv} className="btn btn-primary w-full text-sm">Export to CSV</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
