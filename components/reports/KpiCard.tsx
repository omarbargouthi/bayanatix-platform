"use client";

import { getRagStatus, RAG_CLASSES } from "@/lib/reports/rag";
import type { KpiCardData } from "@/lib/queries/reports";

function formatValue(value: number, format: KpiCardData["format"]): string {
  if (format === "PERCENT") return `${value}%`;
  if (format === "DAYS") return `${value}d`;
  return String(value);
}

export function KpiCard({ kpi, selected, onSelect }: { kpi: KpiCardData; selected?: boolean; onSelect?: () => void }) {
  const rag = getRagStatus(kpi.value, kpi.targetValue, kpi.direction);
  const classes = RAG_CLASSES[rag];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card border-l-4 px-5 py-4 text-left w-full transition-shadow ${classes.border} ${classes.bg} ${selected ? "ring-2 ring-brand-purple/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`text-2xl font-extrabold ${classes.text}`}>{formatValue(kpi.value, kpi.format)}</div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${classes.badge}`}>
          {rag}
        </span>
      </div>
      <div className="text-[11px] text-muted mt-1 uppercase tracking-wider">{kpi.nameEn}</div>
      {kpi.targetValue != null && (
        <div className="text-xs text-muted mt-1">
          Target: {formatValue(kpi.targetValue, kpi.format)} ({kpi.direction === "UP" ? "higher is better" : "lower is better"})
        </div>
      )}
    </button>
  );
}
