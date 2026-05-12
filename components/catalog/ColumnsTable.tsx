"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DataAttribute } from "@/lib/types";
import { Tag, ClassificationTag } from "@/components/ui/Tag";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { GlossaryTermPicker } from "./GlossaryTermPicker";
import { TagPicker } from "./TagPicker";
import { TermMultiPicker } from "./TermMultiPicker";

const COLUMN_TYPE_OPTIONS = [
  { value: "",          label: "— None —" },
  { value: "BUSINESS",  label: "Business Column" },
  { value: "TECHNICAL", label: "Technical Column" },
];

function AttributeEditModal({
  attr,
  onClose,
}: {
  attr: DataAttribute;
  onClose: () => void;
}) {
  const router = useRouter();
  const [description,  setDescription]  = useState(attr.description  ?? "");
  const [friendlyName, setFriendlyName] = useState(attr.friendlyName ?? "");
  const [isEncrypted,  setIsEncrypted]  = useState(attr.isEncrypted  ?? false);
  const [columnType,   setColumnType]   = useState(attr.columnType   ?? "");
  const [glossaryTerm, setGlossaryTerm] = useState(attr.glossaryTerm ?? "");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [showHistory,  setShowHistory]  = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/catalog/attributes/${attr.attributeId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description, friendlyName, isEncrypted, columnType: columnType || null, glossaryTerm }),
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
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <div>
              <h2 className="font-bold text-brand-deep">{attr.physicalName}</h2>
              <p className="text-[11px] text-muted font-mono">{attr.dataType}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="text-[11px] text-brand-purple hover:underline font-medium"
              >
                View History
              </button>
              <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none ml-2">&times;</button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="field-label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder="Describe this column…"
              />
              <div className="mt-2 rounded-md bg-canvas-soft border border-line px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-0.5">
                  From source system
                </div>
                {attr.sourceDescription
                  ? <p className="text-[12px] text-ink-soft leading-relaxed">{attr.sourceDescription}</p>
                  : <p className="text-[12px] text-muted italic">No comment found in source database.</p>
                }
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Friendly Name</label>
                <input
                  type="text"
                  value={friendlyName}
                  onChange={(e) => setFriendlyName(e.target.value)}
                  className="input-field"
                  placeholder="e.g. Customer Identifier"
                />
              </div>
              <div>
                <label className="field-label">Business Term</label>
                <GlossaryTermPicker value={glossaryTerm} onChange={setGlossaryTerm} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="field-label">Column Type</label>
                <select
                  value={columnType}
                  onChange={(e) => setColumnType(e.target.value)}
                  className="input-field"
                >
                  {COLUMN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2.5 pb-2.5">
                <input
                  type="checkbox"
                  id="col-encrypted"
                  checked={isEncrypted}
                  onChange={(e) => setIsEncrypted(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-purple"
                />
                <label htmlFor="col-encrypted" className="text-sm text-ink cursor-pointer select-none">
                  Encrypted Field
                </label>
              </div>
            </div>

            <div>
              <label className="field-label">Tags</label>
              <TagPicker assetType="DATA_ATTRIBUTES" assetId={attr.attributeId} />
            </div>

            <div>
              <label className="field-label">Business Terms</label>
              <TermMultiPicker assetType="DATA_ATTRIBUTES" assetId={attr.attributeId} />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
            <button onClick={onClose} className="btn">Cancel</button>
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {showHistory && (
        <AssetHistoryDrawer
          assetType="DATA_ATTRIBUTES"
          assetId={attr.attributeId}
          assetName={attr.physicalName}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}

const COLUMN_TYPE_LABEL: Record<string, string> = {
  BUSINESS:  "Business",
  TECHNICAL: "Technical",
};

export function ColumnsTable({
  attributes,
  canEdit,
}: {
  attributes: DataAttribute[];
  canEdit:    boolean;
}) {
  const [editing, setEditing] = useState<DataAttribute | null>(null);

  const cols = canEdit
    ? "grid-cols-[36px_1.6fr_1fr_0.9fr_1.1fr_1fr_1fr_36px]"
    : "grid-cols-[36px_1.6fr_1fr_0.9fr_1.1fr_1fr_1fr]";

  return (
    <>
      {editing && (
        <AttributeEditModal attr={editing} onClose={() => setEditing(null)} />
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h3 className="font-bold">
            Columns
            <span className="text-muted text-xs font-normal ml-1.5">{attributes.length} attributes</span>
          </h3>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm">Filter</button>
            <button className="btn btn-sm">Sort</button>
            <button className="btn btn-sm">Profile</button>
          </div>
        </div>

        <div className={`grid ${cols} gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold`}>
          <div />
          <div>Column</div>
          <div>Type</div>
          <div>Null %</div>
          <div>Sensitivity</div>
          <div>Glossary</div>
          <div>Quality</div>
          {canEdit && <div />}
        </div>

        {attributes.map((a) => (
          <div
            key={a.attributeId}
            className={`grid ${cols} gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors`}
          >
            <div>
              {a.isPrimaryKey ? (
                <span className="w-[22px] h-[22px] grid place-items-center bg-brand-purple/10 text-brand-purple rounded text-[10px] font-bold">PK</span>
              ) : a.physicalName.endsWith("_id") ? (
                <span className="w-[22px] h-[22px] grid place-items-center bg-brand-light/30 text-brand-navy rounded text-[10px] font-bold">FK</span>
              ) : null}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-brand-deep">{a.physicalName}</span>
                {a.isEncrypted && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    🔒 Enc
                  </span>
                )}
                {a.columnType && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {COLUMN_TYPE_LABEL[a.columnType] ?? a.columnType}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted">{a.description ?? a.sourceDescription ?? a.friendlyName ?? "—"}</div>
            </div>
            <div className="font-mono text-[12px] text-ink-soft">{a.dataType}</div>
            <div>{a.nullPercentage != null ? `${Number(a.nullPercentage).toFixed(1)}%` : "—"}</div>
            <div><ClassificationTag code={a.classificationCode} /></div>
            <div>
              {a.glossaryTerm
                ? <Tag variant="blue">{a.glossaryTerm}</Tag>
                : <span className="text-muted">—</span>}
            </div>
            <div>
              {a.qualityScore != null ? (
                <div>
                  <div className={`text-sm font-bold ${Number(a.qualityScore) >= 90 ? "text-emerald-600" : Number(a.qualityScore) >= 70 ? "text-amber-600" : "text-red-600"}`}>
                    {Number(a.qualityScore).toFixed(1)}%
                  </div>
                  <div className="mt-1 h-1 bg-line rounded-full overflow-hidden w-14">
                    <div
                      className={`h-full rounded-full ${Number(a.qualityScore) >= 90 ? "bg-emerald-500" : Number(a.qualityScore) >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, Number(a.qualityScore))}%` }}
                    />
                  </div>
                </div>
              ) : <span className="text-muted">—</span>}
            </div>
            {canEdit && (
              <div>
                <button
                  onClick={() => setEditing(a)}
                  className="w-7 h-7 grid place-items-center rounded hover:bg-brand-purple/10 text-muted hover:text-brand-purple transition-colors"
                  title="Edit column metadata"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
