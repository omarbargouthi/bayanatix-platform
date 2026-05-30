"use client";

import { useState, useEffect, useRef } from "react";
import type { TagRecord } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

function TagChip({ tag, onRemove }: { tag: TagRecord; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-medium"
      style={{ background: tag.colorHex }}
    >
      {tag.tagName}
      <button type="button" onClick={onRemove} className="hover:opacity-70 leading-none text-[13px]">&times;</button>
    </span>
  );
}

export function TagPicker({
  assetType,
  assetId,
}: {
  assetType: string;
  assetId:   number;
}) {
  const { t: strings } = useLang();
  const c = strings.catalog;

  const [allTags,  setAllTags]  = useState<TagRecord[]>([]);
  const [selected, setSelected] = useState<TagRecord[]>([]);
  const [open,     setOpen]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/tags").then((r) => r.ok ? r.json() : []),
      fetch(`/api/assets/${assetType}/${assetId}/tags`).then((r) => r.ok ? r.json() : []),
    ]).then(([all, current]) => {
      setAllTags(all);
      setSelected(current);
      setLoading(false);
    });
  }, [assetType, assetId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function toggle(tag: TagRecord) {
    const next = selected.some((s) => s.tagId === tag.tagId)
      ? selected.filter((s) => s.tagId !== tag.tagId)
      : [...selected, tag];
    setSelected(next);
    setSaving(true);
    await fetch(`/api/assets/${assetType}/${assetId}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next.map((t) => t.tagId) }),
    });
    setSaving(false);
  }

  const roots    = allTags.filter((t) => t.parentTagId === null);
  const childMap = new Map<number, TagRecord[]>();
  for (const t of allTags) {
    if (t.parentTagId !== null) {
      const arr = childMap.get(t.parentTagId) ?? [];
      arr.push(t);
      childMap.set(t.parentTagId, arr);
    }
  }

  if (loading) return <div className="text-[11px] text-muted">{c.loadingTags}</div>;

  return (
    <div ref={ref} className="relative">
      {/* Selected chips + trigger */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[34px] px-2.5 py-1.5 border border-line rounded-md bg-white cursor-pointer hover:border-brand-purple/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length === 0 && (
          <span className="text-muted text-[13px] self-center">{c.addTags}</span>
        )}
        {selected.map((sel) => (
          <TagChip key={sel.tagId} tag={sel} onRemove={() => toggle(sel)} />
        ))}
        {saving && <span className="text-[11px] text-muted self-center ml-1">{strings.common.saving}</span>}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-line rounded-xl shadow-lg max-h-64 overflow-y-auto py-1.5">
          {roots.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted">{c.noTagsDefined}</div>
          )}
          {roots.map((root) => {
            const children = childMap.get(root.tagId) ?? [];
            const rootSel  = selected.some((s) => s.tagId === root.tagId);
            return (
              <div key={root.tagId}>
                <button
                  type="button"
                  onClick={() => toggle(root)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-canvas-soft text-left transition-colors"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: root.colorHex }} />
                  <span className="flex-1 text-[13px] font-medium text-ink">{root.tagName}</span>
                  {rootSel && <svg className="w-3.5 h-3.5 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
                {children.map((child) => {
                  const childSel = selected.some((s) => s.tagId === child.tagId);
                  return (
                    <button
                      key={child.tagId}
                      type="button"
                      onClick={() => toggle(child)}
                      className="w-full flex items-center gap-2.5 pl-8 pr-3 py-1.5 hover:bg-canvas-soft text-left transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: child.colorHex }} />
                      <span className="flex-1 text-[12px] text-ink">{child.tagName}</span>
                      {childSel && <svg className="w-3 h-3 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
