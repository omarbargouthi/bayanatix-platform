"use client";

import { Donut } from "@/components/ui/Donut";
import { useLang } from "@/lib/lang-context";
import { HelpTip } from "@/components/ui/HelpTip";

const HELP = "/help/data-catalog#table-indicators";

function Mini({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="bg-canvas-soft rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted flex items-start justify-between gap-1">{label} <HelpTip text={help} href={HELP} /></div>
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
      <h3 className="font-bold mb-3 flex items-center justify-center gap-1.5">{c.tableHealth} <HelpTip text={c.tableHealthHow} href={HELP} /></h3>
      <div className="flex justify-center">
        <Donut value={overallQualityScore ?? 0} size={180} strokeWidth={16} gradientId="g-health" />
      </div>
      <p className="text-muted text-xs mt-2">
        {overallQualityScore != null ? c.overallQualityScore : c.noRulesScored}
      </p>

      <div className="grid grid-cols-2 gap-2.5 mt-4 text-left">
        <Mini label={c.overallCdes} value={String(cdeCount)} help={c.cdeCountHow} />
        <Mini label={c.metadataCompletion} value={`${metadataCompletionPct}%`} help={c.metadataCompletionHow} />
        <Mini label={c.columnTypeClassification} value={`${columnTypeClassificationPct}%`} help={c.columnTypeHow} />
        <Mini label={c.overallQualityScore} value={overallQualityScore != null ? `${overallQualityScore}%` : "—"} help={c.tableHealthHow} />
      </div>
    </div>
  );
}
