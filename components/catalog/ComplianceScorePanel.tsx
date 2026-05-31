"use client";

import { Donut } from "@/components/ui/Donut";
import { useLang } from "@/lib/lang-context";

function Mini({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-canvas-soft rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={"font-bold text-ink " + (valueClass ?? "")}>{value}</div>
    </div>
  );
}

export function ComplianceScorePanel({
  trustScore,
  piiCount,
  classificationValue,
  retentionValue,
  pdplValue,
  pdplClass,
}: {
  trustScore: number;
  piiCount: number;
  classificationValue: string;
  retentionValue: string;
  pdplValue: string;
  pdplClass?: string;
}) {
  const { t } = useLang();
  const g = t.catalog;

  return (
    <div className="card p-5 text-center">
      <h3 className="font-bold mb-3">{g.complianceScore}</h3>
      <div className="flex justify-center">
        <Donut value={Math.round(trustScore)} size={180} strokeWidth={16} gradientId="g-trust" />
      </div>
      <p className="text-muted text-xs mt-2">8 of 9 checks passing · 1 open finding</p>

      <div className="grid grid-cols-2 gap-2.5 mt-4 text-left">
        <Mini label={g.piiColumns} value={`${piiCount} · masked`} />
        <Mini label={g.classificationLabel} value={classificationValue} />
        <Mini label={g.retentionLabel} value={retentionValue} />
        <Mini label={g.pdplStatus} value={pdplValue} valueClass={pdplClass} />
      </div>
    </div>
  );
}
