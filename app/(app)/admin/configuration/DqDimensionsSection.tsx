"use client";

import { useState, useEffect } from "react";
import type { DqDimension } from "@/lib/queries/dq";

type EditForm = {
  nameEn:  string;
  nameAr:  string;
  descEn:  string;
  descAr:  string;
};

export function DqDimensionsSection() {
  const [dims, setDims]         = useState<DqDimension[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [form, setForm]         = useState<EditForm>({ nameEn: "", nameAr: "", descEn: "", descAr: "" });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/dq-dimensions");
      if (r.ok) setDims(await r.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function startEdit(d: DqDimension) {
    setEditCode(d.code);
    setForm({ nameEn: d.name, nameAr: d.nameAr ?? "", descEn: d.description ?? "", descAr: d.descriptionAr ?? "" });
  }

  async function save(code: string) {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/dq-dimensions/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn: form.nameEn || null,
          nameAr: form.nameAr || null,
          descEn: form.descEn || null,
          descAr: form.descAr || null,
        }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      setEditCode(null);
      setSaved(code);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">DQ Dimensions</h2>
        <p className="text-xs text-muted mt-1">
          Configure English and Arabic names and descriptions for each data quality dimension.
          These names appear throughout the platform when displaying quality rules and results.
        </p>
      </div>

      {loading && <div className="card p-8 text-center text-sm text-muted">Loading…</div>}

      {!loading && (
        <div className="card divide-y divide-line overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[100px_1fr_1fr_80px] gap-3 px-5 py-2.5 bg-canvas-soft text-[11px] uppercase tracking-wider text-muted font-bold">
            <div>Code</div>
            <div>English</div>
            <div>Arabic (عربي)</div>
            <div>Actions</div>
          </div>

          {dims.map((d) => (
            <div key={d.code}>
              {editCode === d.code ? (
                <div className="px-5 py-4 space-y-3 bg-blue-50/40">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-brand-deep font-semibold bg-brand-purple/10 px-2 py-0.5 rounded">{d.code}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Name (EN)</label>
                      <input className="input w-full" value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">الاسم (AR)</label>
                      <input className="input w-full" dir="rtl" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">Description (EN)</label>
                      <textarea className="input w-full resize-none h-16 text-sm" value={form.descEn} onChange={e => setForm(f => ({ ...f, descEn: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">الوصف (AR)</label>
                      <textarea className="input w-full resize-none h-16 text-sm" dir="rtl" value={form.descAr} onChange={e => setForm(f => ({ ...f, descAr: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => save(d.code)} disabled={saving} className="btn btn-primary btn-sm">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditCode(null)} className="btn btn-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[100px_1fr_1fr_80px] gap-3 px-5 py-3.5 items-start hover:bg-canvas-soft">
                  <div className="font-mono text-[11px] text-brand-deep font-semibold pt-0.5">{d.code}</div>
                  <div>
                    <div className="font-medium text-ink text-sm">{d.name}</div>
                    {d.description && <div className="text-[11px] text-muted mt-0.5 line-clamp-2">{d.description}</div>}
                  </div>
                  <div>
                    {d.nameAr
                      ? <div className="font-medium text-ink text-sm" dir="rtl">{d.nameAr}</div>
                      : <span className="text-muted text-[11px] italic">Not set</span>}
                    {d.descriptionAr && <div className="text-[11px] text-muted mt-0.5 line-clamp-2" dir="rtl">{d.descriptionAr}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(d)} className="btn btn-sm text-xs">Edit</button>
                    {saved === d.code && <span className="text-green-600 text-xs font-bold">✓</span>}
                  </div>
                </div>
              )}
            </div>
          ))}

          {dims.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">No DQ dimensions found.</div>
          )}
        </div>
      )}
    </div>
  );
}
