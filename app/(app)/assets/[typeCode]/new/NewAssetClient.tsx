"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AttributeForm, type AttributeDef } from "@/components/custom-assets/AttributeForm";

export function NewAssetClient({ typeCode, typeName }: { typeCode: string; typeName: string }) {
  const router = useRouter();
  const [attributes, setAttributes] = useState<AttributeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetNameText, setAssetNameText] = useState("");
  const [nameArText, setNameArText] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/custom-assets/${typeCode}`)
      .then((r) => r.json())
      .then((data) => setAttributes(data.attributes))
      .finally(() => setLoading(false));
  }, [typeCode]);

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const r = await fetch(`/api/custom-assets/${typeCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetNameText, nameArText: nameArText || null, descriptionText: descriptionText || null, attributes: values }),
      });
      const body = await r.json();
      if (!r.ok) {
        if (body.errors) {
          setFieldErrors(Object.fromEntries(body.errors.map((e: any) => [e.attrCode, e.message])));
        }
        setError(body.error === "validation_failed" ? "Please fix the highlighted fields." : (body.error ?? "Failed to create."));
        return;
      }
      router.push(`/assets/${typeCode}/${body.assetId}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-brand-deep">New {typeName}</h1>

      <div className="card-padded space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Name *</label>
            <input className="field-input" value={assetNameText} onChange={(e) => setAssetNameText(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Name (Arabic)</label>
            <input className="field-input" value={nameArText} onChange={(e) => setNameArText(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="field-label">Description</label>
            <textarea className="field-input" rows={2} value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)} />
          </div>
        </div>

        <AttributeForm attributes={attributes} values={values} onChange={(code, v) => setValues((prev) => ({ ...prev, [code]: v }))} />
        {Object.keys(fieldErrors).length > 0 && (
          <ul className="text-xs text-red-600 list-disc pl-4">
            {Object.entries(fieldErrors).map(([code, msg]) => <li key={code}>{msg}</li>)}
          </ul>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}

        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !assetNameText.trim()} className="btn btn-primary text-sm">
            {saving ? "Saving…" : "Create"}
          </button>
          <button onClick={() => router.back()} className="btn text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
