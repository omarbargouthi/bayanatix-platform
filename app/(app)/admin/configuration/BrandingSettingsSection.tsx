"use client";

import { useState, useEffect, useRef } from "react";

type BrandingInfo = { hasCustomLogo: boolean; logoFilename: string | null; updatedAt: string | null };

export function BrandingSettingsSection() {
  const [info, setInfo]       = useState<BrandingInfo | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch("/api/admin/branding");
    setInfo(await r.json());
  }
  useEffect(() => { void load(); }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const r = await fetch("/api/admin/branding", { method: "PUT", body: form });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Upload failed"); return; }
      setInfo(data);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!confirm("Remove the customer logo? The Bayanis logo is unaffected either way.")) return;
    setSaving(true);
    try {
      setInfo(await (await fetch("/api/admin/branding", { method: "DELETE" })).json());
    } finally { setSaving(false); }
  }

  function onFileChosen() {
    const file = fileRef.current?.files?.[0];
    setError(null);
    if (!file) { setPreview(null); return; }
    setPreview(URL.createObjectURL(file));
  }

  if (!info) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">Customer Logo</h2>
        <p className="text-xs text-muted mt-1">
          Shown alongside the Bayanis logo (not instead of it) in the sidebar and on the sign-in page, so this stays
          recognizable as your organization&apos;s own internal application. SVG, PNG, JPEG, or WebP, up to 2MB.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-lg space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg border border-line bg-canvas-soft grid place-items-center overflow-hidden shrink-0">
            {preview
              ? <img src={preview} alt="Preview" className="max-w-full max-h-full object-contain" />
              : info.hasCustomLogo
              ? <img src={`/api/branding/logo?t=${info.updatedAt ?? ""}`} alt="Current customer logo" className="max-w-full max-h-full object-contain" />
              : <span className="text-[10px] text-muted text-center px-1">None set</span>}
          </div>
          <div className="text-sm">
            {info.hasCustomLogo
              ? <><div className="font-medium text-ink">Customer logo active</div><div className="text-[11px] text-muted mt-0.5 truncate max-w-[220px]">{info.logoFilename}</div></>
              : <div className="text-muted">No customer logo set — only the Bayanis logo is shown</div>}
          </div>
        </div>

        <div>
          <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={onFileChosen}
            className="block w-full text-sm text-ink file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-purple/10 file:text-brand-purple file:text-sm file:font-semibold hover:file:bg-brand-purple/20" />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleUpload} disabled={saving || !preview} className="btn btn-primary btn-sm">
            {saving ? "Uploading…" : "Upload Logo"}
          </button>
          {info.hasCustomLogo && (
            <button onClick={handleRemove} disabled={saving} className="btn btn-sm text-red-600 hover:bg-red-50">Remove Customer Logo</button>
          )}
          {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
        </div>
      </div>
    </div>
  );
}
