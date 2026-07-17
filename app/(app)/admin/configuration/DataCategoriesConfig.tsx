"use client";

import { useEffect, useState, useCallback } from "react";
import { useLang } from "@/lib/lang-context";
import type { DataCategory } from "@/lib/types";

// ── Single category row (name + AR name, expand children, add sub, edit, delete) ─

function CategoryRow({
  category,
  depth,
  onRefresh,
}: {
  category: DataCategory;
  depth: number;
  onRefresh: () => void;
}) {
  const { isRtl } = useLang();
  const [open, setOpen]           = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [subForm, setSubForm]     = useState({ name: "", nameAr: "" });
  const [editForm, setEditForm]   = useState({ name: category.name, nameAr: category.nameAr ?? "" });
  const [saving, setSaving]       = useState(false);

  const hasChildren = (category.children?.length ?? 0) > 0;
  const displayName = isRtl && category.nameAr ? category.nameAr : category.name;

  async function saveEdit() {
    if (!editForm.name.trim()) return;
    setSaving(true);
    await fetch(`/api/retention/categories/${category.categoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name.trim(), nameAr: editForm.nameAr.trim() || null }),
    });
    setSaving(false);
    setEditing(false);
    onRefresh();
  }

  async function addSub() {
    if (!subForm.name.trim()) return;
    setSaving(true);
    await fetch("/api/retention/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:      subForm.name.trim(),
        nameAr:    subForm.nameAr.trim() || null,
        parentId:  category.categoryId,
        sensitivity: category.sensitivity,
      }),
    });
    setSaving(false);
    setShowAddSub(false);
    setSubForm({ name: "", nameAr: "" });
    setOpen(true);
    onRefresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${category.name}"? This cannot be undone.`)) return;
    await fetch(`/api/retention/categories/${category.categoryId}`, { method: "DELETE" });
    onRefresh();
  }

  const indent = isRtl
    ? "mr-" + depth * 4 + " border-r border-line-soft pr-3"
    : "ml-" + depth * 4 + " border-l border-line-soft pl-3";

  return (
    <div className={depth > 0 ? indent : ""}>
      {/* Row */}
      {editing ? (
        <div className="py-2 flex items-center gap-2 flex-wrap">
          <input
            className="input-sm flex-1 min-w-[140px]"
            placeholder="Name (EN)"
            value={editForm.name}
            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
          <input
            className="input-sm flex-1 min-w-[140px]"
            placeholder="الاسم بالعربي"
            dir="rtl"
            value={editForm.nameAr}
            onChange={e => setEditForm(f => ({ ...f, nameAr: e.target.value }))}
          />
          <button
            className="btn-primary text-[11px] py-1 px-3"
            disabled={saving}
            onClick={saveEdit}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className="btn-secondary text-[11px] py-1 px-3"
            onClick={() => { setEditing(false); setEditForm({ name: category.name, nameAr: category.nameAr ?? "" }); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 group">
          <button
            className="text-[11px] text-muted w-4 shrink-0"
            onClick={() => setOpen(v => !v)}
          >
            {hasChildren ? (open ? "▼" : "▶") : "·"}
          </button>
          <span className="flex-1 text-[13px] font-medium text-ink truncate">{displayName}</span>
          {category.nameAr && !isRtl && (
            <span className="text-[11px] text-muted" dir="rtl">{category.nameAr}</span>
          )}
          {!isRtl && category.nameAr == null && (
            <span className="text-[11px] text-muted italic">No Arabic</span>
          )}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 shrink-0">
            <button
              className="text-[11px] text-brand-purple hover:underline"
              onClick={() => setShowAddSub(v => !v)}
            >
              + Sub
            </button>
            <button
              className="text-[11px] text-brand-purple hover:underline"
              onClick={() => { setEditing(true); setEditForm({ name: category.name, nameAr: category.nameAr ?? "" }); }}
            >
              Edit
            </button>
            <button
              className="text-[11px] text-red-400 hover:text-red-600"
              onClick={handleDelete}
            >
              Del
            </button>
          </div>
        </div>
      )}

      {/* Add sub-category inline */}
      {showAddSub && (
        <div className="mb-2 p-2.5 bg-gray-50 rounded-lg border border-line text-[11px] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input-sm"
              placeholder="Sub-category name (EN)"
              value={subForm.name}
              onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <input
              className="input-sm"
              placeholder="الاسم بالعربي"
              dir="rtl"
              value={subForm.nameAr}
              onChange={e => setSubForm(f => ({ ...f, nameAr: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary text-[10px] py-1" onClick={() => setShowAddSub(false)}>Cancel</button>
            <button className="btn-primary text-[10px] py-1" disabled={saving} onClick={addSub}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Children */}
      {open && category.children?.map(child => (
        <CategoryRow key={child.categoryId} category={child} depth={depth + 1} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DataCategoriesConfig() {
  const [categories, setCategories] = useState<DataCategory[] | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [form, setForm]             = useState({ name: "", nameAr: "" });
  const [saving, setSaving]         = useState(false);

  const load = useCallback(() => {
    fetch("/api/retention/categories")
      .then(r => r.json())
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addCategory() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/retention/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:        form.name.trim(),
        nameAr:      form.nameAr.trim() || null,
        sensitivity: "INTERNAL",
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ name: "", nameAr: "" });
    load();
  }

  return (
    <div className="card p-5 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-ink text-sm">Data Categories</span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(v => !v)}
        >
          + Add Category
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-line space-y-2 text-[12px]">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input-sm"
              placeholder="Category name (EN)"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <input
              className="input-sm"
              placeholder="اسم الفئة بالعربي"
              dir="rtl"
              value={form.nameAr}
              onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-sm" onClick={() => { setShowAdd(false); setForm({ name: "", nameAr: "" }); }}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={addCategory}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {categories == null ? (
        <div className="py-8 text-center text-muted text-sm">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="py-8 text-center text-muted text-sm">No categories yet.</div>
      ) : (
        <div className="divide-y divide-line-soft">
          {categories.map(cat => (
            <CategoryRow key={cat.categoryId} category={cat} depth={0} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
