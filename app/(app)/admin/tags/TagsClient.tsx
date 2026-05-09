"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TagRecord } from "@/lib/types";

const PALETTE = [
  "#6058A0","#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6",
  "#EC4899","#14B8A6","#F97316","#6366F1","#84CC16","#0EA5E9",
];

function TagDot({ color }: { color: string }) {
  return <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: color }} />;
}

function TagForm({
  initial,
  parentTagId,
  parentName,
  onSave,
  onCancel,
}: {
  initial?:    TagRecord;
  parentTagId?: number | null;
  parentName?:  string;
  onSave:      (data: { tagName: string; colorHex: string; description: string }) => Promise<void>;
  onCancel:    () => void;
}) {
  const [tagName,     setTagName]     = useState(initial?.tagName     ?? "");
  const [colorHex,    setColorHex]    = useState(initial?.colorHex    ?? PALETTE[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function submit() {
    if (!tagName.trim()) { setError("Tag name is required"); return; }
    setSaving(true);
    try { await onSave({ tagName: tagName.trim(), colorHex, description }); }
    catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-canvas-soft border border-line rounded-lg p-4 space-y-3 mt-2">
      {parentName && (
        <p className="text-[12px] text-muted">Sub-tag under <strong>{parentName}</strong></p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Tag Name</label>
          <input
            type="text" value={tagName} onChange={(e) => setTagName(e.target.value)}
            className="input-field" placeholder="e.g. Revenue" autoFocus
          />
        </div>
        <div>
          <label className="field-label">Description</label>
          <input
            type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            className="input-field" placeholder="Optional"
          />
        </div>
      </div>
      <div>
        <label className="field-label">Colour</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColorHex(c)}
              className={`w-6 h-6 rounded-full transition-transform ${colorHex === c ? "ring-2 ring-offset-1 ring-brand-deep scale-110" : ""}`}
              style={{ background: c }}
            />
          ))}
          <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)}
            className="w-6 h-6 rounded-full cursor-pointer border-0 p-0" title="Custom colour" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn btn-sm">Cancel</button>
        <button onClick={submit} disabled={saving} className="btn btn-primary btn-sm">
          {saving ? "Saving…" : initial ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}

export function TagsClient({ tags: initial }: { tags: TagRecord[] }) {
  const router  = useRouter();
  const [tags,        setTags]        = useState<TagRecord[]>(initial);
  const [addingRoot,  setAddingRoot]  = useState(false);
  const [addingSub,   setAddingSub]   = useState<number | null>(null);
  const [editing,     setEditing]     = useState<number | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const roots    = tags.filter((t) => t.parentTagId === null);
  const childMap = new Map<number, TagRecord[]>();
  for (const t of tags) {
    if (t.parentTagId !== null) {
      const arr = childMap.get(t.parentTagId) ?? [];
      arr.push(t);
      childMap.set(t.parentTagId, arr);
    }
  }

  async function reload() {
    const res = await fetch("/api/admin/tags");
    if (res.ok) setTags(await res.json());
    router.refresh();
  }

  async function handleCreate(data: { tagName: string; colorHex: string; description: string }, parentTagId?: number | null) {
    const res = await fetch("/api/admin/tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, parentTagId: parentTagId ?? null }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    setAddingRoot(false); setAddingSub(null);
    await reload();
  }

  async function handleUpdate(tagId: number, data: { tagName: string; colorHex: string; description: string }) {
    const res = await fetch(`/api/admin/tags/${tagId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    setEditing(null);
    await reload();
  }

  async function handleDelete(tagId: number) {
    if (!confirm("Delete this tag and all its sub-tags?")) return;
    await fetch(`/api/admin/tags/${tagId}`, { method: "DELETE" });
    await reload();
  }

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-brand-deep">Tag Hierarchy</h2>
          <p className="text-sm text-muted mt-0.5">Define tags and sub-tags that can be assigned to any asset.</p>
        </div>
        <button onClick={() => setAddingRoot(true)} className="btn btn-primary btn-sm">+ New Tag</button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      {addingRoot && (
        <TagForm
          onSave={(d) => handleCreate(d, null)}
          onCancel={() => setAddingRoot(false)}
        />
      )}

      <div className="card overflow-hidden">
        {roots.length === 0 && !addingRoot && (
          <div className="py-14 text-center text-muted text-sm">No tags yet. Create your first tag above.</div>
        )}

        {roots.map((tag) => {
          const children = childMap.get(tag.tagId) ?? [];
          return (
            <div key={tag.tagId} className="border-b border-line-soft last:border-0">
              {/* Root tag row */}
              <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas-soft transition-colors">
                <TagDot color={tag.colorHex} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-ink">{tag.tagName}</span>
                    <span className="text-[11px] text-muted">{children.length} sub-tag{children.length !== 1 ? "s" : ""}</span>
                  </div>
                  {tag.description && <p className="text-[11px] text-muted">{tag.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setAddingSub(tag.tagId)} className="btn btn-sm text-xs">+ Sub-tag</button>
                  <button onClick={() => setEditing(tag.tagId)} className="btn btn-sm text-xs">Edit</button>
                  <button onClick={() => handleDelete(tag.tagId)} className="btn btn-sm text-xs text-red-600 hover:bg-red-50">Delete</button>
                </div>
              </div>

              {/* Edit form for root tag */}
              {editing === tag.tagId && (
                <div className="px-5 pb-4">
                  <TagForm
                    initial={tag}
                    onSave={(d) => handleUpdate(tag.tagId, d)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}

              {/* Sub-tag creation form */}
              {addingSub === tag.tagId && (
                <div className="px-5 pb-4">
                  <TagForm
                    parentTagId={tag.tagId}
                    parentName={tag.tagName}
                    onSave={(d) => handleCreate(d, tag.tagId)}
                    onCancel={() => setAddingSub(null)}
                  />
                </div>
              )}

              {/* Sub-tags */}
              {children.map((child) => (
                <div key={child.tagId}>
                  <div className="flex items-center gap-3 pl-12 pr-5 py-3 hover:bg-canvas-soft transition-colors border-t border-line-soft/60">
                    <TagDot color={child.colorHex} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-ink">{child.tagName}</span>
                      {child.description && <p className="text-[11px] text-muted">{child.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditing(child.tagId)} className="btn btn-sm text-xs">Edit</button>
                      <button onClick={() => handleDelete(child.tagId)} className="btn btn-sm text-xs text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                  {editing === child.tagId && (
                    <div className="pl-12 pr-5 pb-4">
                      <TagForm
                        initial={child}
                        onSave={(d) => handleUpdate(child.tagId, d)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
