"use client";

import { useEffect, useState } from "react";

type SourceOption = { id: number; name: string };

// Shared "Source System" filter dropdown for the AI Enrichment review tabs
// (Descriptions, DQ Rules, Column Types, Table Types) — reuses the same
// sources list the DQ AssetPicker already fetches from /api/catalog/browse.
export function SourceSystemSelect({
  value, onChange, className,
}: {
  value: string;
  onChange: (dataSourceId: string) => void;
  className?: string;
}) {
  const [options, setOptions] = useState<SourceOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog/browse?type=sources")
      .then((r) => r.json())
      .then((rows: SourceOption[]) => { if (!cancelled) setOptions(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "text-[12px] border border-line rounded-md px-2 py-1.5"}
    >
      <option value="">All source systems</option>
      {options.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
    </select>
  );
}
