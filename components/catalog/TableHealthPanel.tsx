"use client";

import { Donut } from "@/components/ui/Donut";
import { useLang } from "@/lib/lang-context";

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-canvas-soft rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-bold text-ink">{value}</div>
    </div>
  );
}

export function TableHealthPanel({
  cdeCount,
  metadataCompletionPct,
  columnTypeClassificationPct,
  overallQualityScore,
}: {
  cdeCount: number;
  metadataCompletionPct: number;
  columnTypeClassificationPct: number;
  overallQualityScore: number | null;
}) {
  const { t } = useLang();
  const c = t.catalog;

  return (
    <div className="card p-5 text-center">
      <h3 className="font-bold mb-3">{c.tableHealth}</h3>
      <div className="flex justify-center">
        <Donut value={overallQualityScore ?? 0} size={180} strokeWidth={16} gradientId="g-health" />
      </div>
      <p className="text-muted text-xs mt-2">
        {overallQualityScore != null ? c.overallQualityScore : c.noRulesScored}
      </p>

      <div className="grid grid-cols-2 gap-2.5 mt-4 text-left">
        <Mini label={c.overallCdes} value={String(cdeCount)} />
        <Mini label={c.metadataCompletion} value={`${metadataCompletionPct}%`} />
        <Mini label={c.columnTypeClassification} value={`${columnTypeClassificationPct}%`} />
        <Mini label={c.overallQualityScore} value={overallQualityScore != null ? `${overallQualityScore}%` : "—"} />
      </div>
    </div>
  );
}
