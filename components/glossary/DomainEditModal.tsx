"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CLASSIFICATION_OPTIONS = [
  { value: "",            label: "— None —" },
  { value: "PUBLIC",      label: "Public" },
  { value: "INTERNAL",    label: "Internal" },
  { value: "CONFIDENTIAL",label: "Confidential" },
  { value: "RESTRICTED",  label: "Restricted" },
  { value: "SECRET",      label: "Secret" },
  { value: "TOP_SECRET",  label: "Top Secret" },
];

interface Props {
  glossaryId:  number;
  kindLabel:   "Domain" | "Sub-domain";
  termName:    string;
  description: string | null;
  classCode:   string | null;
  onClose:     () => void;
}

export function DomainEditModal({ glossaryId, kindLabel, termName: initialName, description: initialDescription, classCode: initialClassCode, onClose }: Props) {
  const router = useRouter();
  const [termName,    setTermName]    = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [classCode,   setClassCode]   = useState(initialClassCode ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function save() {
    if (!termName.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/glossary/domains/${glossaryId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ termName: termName.trim(), description, classCode: classCode || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save");
        return;
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="font-bold text-brand-deep">Edit {kindLabel}: {initialName}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <div>
            <label className="field-label">{kindLabel} Name <span className="text-red-500">*</span></label>
            <input type="text" value={termName} onChange={(e) => setTermName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">Classification</label>
            <select value={classCode} onChange={(e) => setClassCode(e.target.value)} className="input-field">
              {CLASSIFICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="input-field resize-none"
              placeholder={`Describe this ${kindLabel.toLowerCase()}…`}
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line shrink-0">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
