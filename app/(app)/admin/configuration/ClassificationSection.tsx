"use client";

import { useState, useEffect } from "react";
import type { AppLookup } from "@/lib/queries/app-lookups";

type EditForm = {
  lookupLabel: string;
  labelAr:     string;
  description: string;
  sortOrder:   number;
  isActive:    boolean;
};

export function ClassificationSection() {
  const [codes, setCodes]       = useState<AppLookup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editId, setEditId]     = useState<number | null>(null);
  const [form, setForm]         = useState<EditForm>({ lookupLabel: "", labelAr: "", description: "", sortOrder: 0, isActive: true });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/lookups?group=CLASSIFICATION");
      if (r.ok) setCodes(await r.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function startEdit(c: AppLookup) {
    setEditId(c.lookupId);
    setForm({
      lookupLabel: c.lookupLabel,
      labelAr:     c.labelAr ?? "",
      description: c.description ?? "",
      sortOrder:   c.sortOrder,
      isActive:    c.isActive,
    });
  }

  async function save(id: number) {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/lookups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupLabel: form.lookupLabel,
          labelAr:     form.labelAr || null,
          description: form.description || null,
          sortOrder:   form.sortOrder,
          isActive:    form.isActive,
        }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      setEditId(null);
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Data Classification</h2>
        <p className="text-xs text-muted mt-1">
          Configure English and Arabic labels for data classification codes.
          These labels appear on assets, columns, and glossary terms across the platform.
        </p>
      </div>

      {loading && <div className="card p-8 text-center text-sm text-muted">Loading…</div>}

      {!loading && (
        <div className="card divide-y divide-line overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[100px_1fr_1fr_80px] gap-3 px-5 py-2.5 bg-canvas-soft text-[11px] uppercase tracking-wider text-muted font-bold">
            <div>Code</div>
            <div>English Label</div>
            <div>Arabic Label (عربي)</div>
            <div>Actions</div>
          </div>

          {codes.map((c) => (
            <div key={c.lookupId}>
              {editId === c.lookupId ? (
                <div className="px-5 py-4 space-y-3 bg-blue-50/40">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-brand-deep font-semibold bg-brand-purple/10 px-2 py-0.5 rounded">{c.lookupCode}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Label (EN)</label>
                      <input className="input w-full" value={form.lookupLabel} onChange={e => setForm(f => ({ ...f, lookupLabel: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">التسمية (AR)</label>
                      <input className="input w-full" dir="rtl" value={form.labelAr} onChange={e => setForm(f => ({ ...f, labelAr: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description</label>
                      <input className="input w-full" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-brand-purple" />
                      <label className="text-sm text-ink">Active</label>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => save(c.lookupId)} disabled={saving} className="btn btn-primary btn-sm">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditId(null)} className="btn btn-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className={`grid grid-cols-[100px_1fr_1fr_80px] gap-3 px-5 py-3.5 items-center hover:bg-canvas-soft ${!c.isActive ? "opacity-50" : ""}`}>
                  <div className="font-mono text-[11px] text-brand-deep font-semibold">{c.lookupCode}</div>
                  <div className="font-medium text-sm text-ink">{c.lookupLabel}</div>
                  <div>
                    {c.labelAr
                      ? <span className="font-medium text-sm text-ink" dir="rtl">{c.labelAr}</span>
                      : <span className="text-muted text-[11px] italic">Not set</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(c)} className="btn btn-sm text-xs">Edit</button>
                    {saved === c.lookupId && <span className="text-green-600 text-xs font-bold">✓</span>}
                  </div>
                </div>
              )}
            </div>
          ))}

          {codes.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">No classification codes found.</div>
          )}
        </div>
      )}
    </div>
  );
}
