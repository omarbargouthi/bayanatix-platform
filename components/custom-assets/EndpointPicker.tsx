"use client";

import { useEffect, useState } from "react";

export type EndpointHit = { typeCode: string; id: number; name: string; sublabel: string | null };

export function EndpointPicker({
  allowedTypes,
  excludeIds,
  onSelect,
  onCancel,
}: {
  allowedTypes: string[];
  excludeIds?: { typeCode: string; id: number }[];
  onSelect: (hit: EndpointHit) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EndpointHit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ types: allowedTypes.join(","), q });
    fetch(`/api/custom-assets/search-endpoints?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setHits(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowedTypes.join(","), q]);

  const excludeSet = new Set((excludeIds ?? []).map((e) => `${e.typeCode}:${e.id}`));
  const visible = hits.filter((h) => !excludeSet.has(`${h.typeCode}:${h.id}`));

  return (
    <div className="border border-line rounded-lg p-3 bg-canvas-soft space-y-2">
      <input
        autoFocus
        className="field-input"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-56 overflow-y-auto border border-line rounded-md bg-white divide-y divide-line-soft">
        {loading ? (
          <div className="px-3 py-3 text-[12px] text-muted">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-muted">No matches.</div>
        ) : (
          visible.map((h) => (
            <button
              key={`${h.typeCode}:${h.id}`}
              type="button"
              onClick={() => onSelect(h)}
              className="w-full text-left px-3 py-2 hover:bg-canvas-soft transition-colors"
            >
              <div className="text-[12px] font-medium text-ink">{h.name}</div>
              <div className="text-[10px] text-muted">
                {h.typeCode.replace("CUSTOM:", "")}{h.sublabel ? ` · ${h.sublabel}` : ""}
              </div>
            </button>
          ))
        )}
      </div>
      <button type="button" onClick={onCancel} className="text-[11px] text-muted hover:underline">Cancel</button>
    </div>
  );
}
