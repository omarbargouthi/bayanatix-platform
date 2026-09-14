"use client";

import { useEffect, useState } from "react";
import type { CustomAttributeAssetType, CustomAttributeDefinition } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";

type Props = {
  assetType: CustomAttributeAssetType;
  assetId: number;
  canEdit: boolean;
  /** When true, shows a "no fields defined" message instead of rendering
   *  nothing — for surfaces (like a dedicated tab) the user navigated to on
   *  purpose. Embedded sections on a busy page should leave this off, so they
   *  stay invisible until an admin actually defines fields for that level. */
  showEmptyState?: boolean;
};

type ValuesResponse = { definitions: CustomAttributeDefinition[]; values: Record<string, unknown> };

function ValueDisplay({ def, value }: { def: CustomAttributeDefinition; value: unknown }) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-muted italic">—</span>;
  }
  if (def.dataType === "BOOLEAN") return <span>{value ? "Yes" : "No"}</span>;
  if (def.dataType === "URL") {
    return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-brand-purple hover:underline break-all">{String(value)}</a>;
  }
  if (def.dataType === "LONGTEXT") return <span className="whitespace-pre-wrap">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function ValueInput({
  def, value, onChange,
}: {
  def: CustomAttributeDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base = "w-full text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-purple";
  switch (def.dataType) {
    case "LONGTEXT":
      return <textarea className={base} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "NUMBER":
      return <input type="number" className={base} value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "DATE":
      return <input type="date" className={base} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "BOOLEAN":
      return (
        <select
          className={base}
          value={value === true ? "true" : value === false ? "false" : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
        >
          <option value="">— select —</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case "ENUM":
      return (
        <select className={base} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— select —</option>
          {(def.enumValues ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    case "URL":
    case "USER":
    case "TEXT":
    default:
      return <input type="text" className={base} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
  }
}

export function CustomAttributesPanel({ assetType, assetId, canEdit, showEmptyState = false }: Props) {
  const { lang } = useLang();
  const [data, setData] = useState<ValuesResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const label = (def: CustomAttributeDefinition) => pickTranslation(def.attrName, def.nameTranslations, lang);

  useEffect(() => {
    fetch(`/api/assets/${assetType}/${assetId}/custom-attributes`)
      .then((r) => r.json())
      .then((d: ValuesResponse) => setData(d));
  }, [assetType, assetId]);

  if (!data) return null;
  if (data.definitions.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🏷</div>
        <h3 className="font-semibold text-ink mb-1">Custom Attributes</h3>
        <p className="text-sm text-muted max-w-sm mx-auto">
          No custom fields are defined for this asset type yet. Define them under
          Administration → Configuration → Custom Attributes.
        </p>
      </div>
    );
  }

  function startEdit() {
    setDraft({ ...data!.values });
    setErr("");
    setEditing(true);
  }

  async function save() {
    const missing = data!.definitions.filter((d) => d.isRequired && (draft[d.attrCode] === undefined || draft[d.attrCode] === null || draft[d.attrCode] === ""));
    if (missing.length > 0) { setErr(`${missing.map(label).join(", ")} — required`); return; }
    setSaving(true);
    const res = await fetch(`/api/assets/${assetType}/${assetId}/custom-attributes`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: draft }),
    });
    setSaving(false);
    if (!res.ok) { setErr("Failed to save"); return; }
    setData({ ...data!, values: draft });
    setEditing(false);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-line-soft">
        <h3 className="text-sm font-bold text-brand-deep">Custom Attributes</h3>
        {canEdit && !editing && (
          <button onClick={startEdit} className="text-[11px] font-semibold text-brand-purple hover:underline">Edit</button>
        )}
      </div>

      {err && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-md mb-3">{err}</p>}

      {editing ? (
        <div className="space-y-3">
          {data.definitions.map((def) => (
            <div key={def.attrDefId}>
              <label className="text-[10px] font-semibold text-muted uppercase mb-1 block">
                {label(def)}{def.isRequired && " *"}
              </label>
              <ValueInput def={def} value={draft[def.attrCode]} onChange={(v) => setDraft((p) => ({ ...p, [def.attrCode]: v }))} />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(false)} className="btn btn-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <dl className="space-y-2.5">
          {data.definitions.map((def) => (
            <div key={def.attrDefId} className="flex items-start gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted w-32 shrink-0 pt-0.5">{label(def)}</dt>
              <dd className="flex-1 text-sm text-ink"><ValueDisplay def={def} value={data.values[def.attrCode]} /></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
