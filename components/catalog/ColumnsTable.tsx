"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DataAttribute } from "@/lib/types";
import { Tag, ClassificationTag } from "@/components/ui/Tag";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { TagPicker } from "./TagPicker";
import { TermMultiPicker } from "./TermMultiPicker";
import { MindMapTab } from "./MindMapTab";
import { ColumnTypeBadge } from "./ColumnTypeBadge";
import { DescriptionEnrichWidget } from "./DescriptionEnrichWidget";
import { RelatedAssetsPanel } from "@/components/custom-assets/RelatedAssetsPanel";
import { useLang } from "@/lib/lang-context";

// ── Column chooser definitions ──────────────────────────────────────────────

type GridColId =
  | "name" | "type" | "nullpct" | "sensitivity" | "glossary" | "quality"
  | "friendly" | "coltype" | "encrypted" | "pii" | "picategory" | "cde"
  | "classTerm" | "enrichTerms";

type GridColDef = { id: GridColId; label: string; width: string; defaultOn: boolean };

const ALL_GRID_COLS: GridColDef[] = [
  { id: "name",        label: "Column",               width: "1.6fr", defaultOn: true  },
  { id: "type",        label: "Data Type",            width: "1fr",   defaultOn: true  },
  { id: "nullpct",     label: "Null %",               width: "0.8fr", defaultOn: true  },
  { id: "sensitivity", label: "Classification",        width: "1.1fr", defaultOn: true  },
  { id: "cde",         label: "CDE",                  width: "0.7fr", defaultOn: true  },
  { id: "classTerm",   label: "Classification Term",  width: "1.2fr", defaultOn: true  },
  { id: "enrichTerms", label: "Context Enrichment",   width: "1.3fr", defaultOn: false },
  { id: "glossary",    label: "Glossary Term",        width: "1fr",   defaultOn: false },
  { id: "quality",     label: "Quality",              width: "0.9fr", defaultOn: true  },
  { id: "friendly",    label: "Friendly Name",        width: "1fr",   defaultOn: false },
  { id: "coltype",     label: "Column Type",          width: "0.9fr", defaultOn: false },
  { id: "encrypted",   label: "Encrypted",            width: "0.8fr", defaultOn: false },
  { id: "pii",         label: "PII",                  width: "0.7fr", defaultOn: false },
  { id: "picategory",  label: "PI Category",          width: "1fr",   defaultOn: false },
];

// CDE = Critical Data Element: column is CDE when classified as Confidential, Secret, or Top Secret
const CDE_CODES = new Set(["CONFIDENTIAL", "SECRET", "TOP_SECRET"]);
function isCde(attr: import("@/lib/types").DataAttribute): boolean {
  const code = (attr.classTermClassCode ?? attr.classificationCode ?? "").toUpperCase();
  return CDE_CODES.has(code);
}

const LS_KEY = "bayanatix_col_prefs_v3";
const DEFAULT_COLS: GridColId[] = ALL_GRID_COLS.filter((c) => c.defaultOn).map((c) => c.id);

function loadColPrefs(): GridColId[] {
  if (typeof window === "undefined") return DEFAULT_COLS;
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as GridColId[];
      const known = new Set<string>(ALL_GRID_COLS.map((c) => c.id));
      const valid = parsed.filter((id) => known.has(id));
      if (valid.length > 0) return valid;
    }
  } catch {}
  return DEFAULT_COLS;
}

function saveColPrefs(cols: GridColId[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cols)); } catch {}
}

const COLUMN_TYPE_LABEL: Record<string, string> = {
  BUSINESS:  "Business",
  TECHNICAL: "Technical",
};

// ── Column chooser popover ──────────────────────────────────────────────────

function ColumnChooser({
  activeColIds,
  onChange,
}: {
  activeColIds: GridColId[];
  onChange: (cols: GridColId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(id: GridColId) {
    const next = activeColIds.includes(id)
      ? activeColIds.filter((c) => c !== id)
      : [...activeColIds, id];
    onChange(next);
    saveColPrefs(next);
  }

  function move(id: GridColId, dir: -1 | 1) {
    const idx = activeColIds.indexOf(id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= activeColIds.length) return;
    const next = [...activeColIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
    saveColPrefs(next);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`btn btn-sm flex items-center gap-1.5 ${open ? "bg-brand-purple/10 border-brand-purple/40 text-brand-purple" : ""}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Columns
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-line w-60 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between">
            <span className="text-sm font-bold text-brand-deep">Visible Columns</span>
            <button
              onClick={() => { onChange(DEFAULT_COLS); saveColPrefs(DEFAULT_COLS); }}
              className="text-[11px] text-muted hover:text-brand-purple"
            >
              Reset
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-line-soft">
            {ALL_GRID_COLS.map((col) => {
              const isOn = activeColIds.includes(col.id);
              const idx  = activeColIds.indexOf(col.id);
              return (
                <div key={col.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-canvas-soft">
                  <input
                    type="checkbox" checked={isOn} onChange={() => toggle(col.id)}
                    className="w-4 h-4 rounded accent-brand-purple shrink-0"
                  />
                  <span className={`flex-1 text-sm ${isOn ? "text-ink font-medium" : "text-muted"}`}>{col.label}</span>
                  {isOn && (
                    <div className="flex gap-0.5">
                      <button onClick={() => move(col.id, -1)} disabled={idx === 0}
                        className="w-5 h-5 grid place-items-center rounded hover:bg-canvas text-muted hover:text-ink disabled:opacity-25">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                      </button>
                      <button onClick={() => move(col.id, 1)} disabled={idx === activeColIds.length - 1}
                        className="w-5 h-5 grid place-items-center rounded hover:bg-canvas text-muted hover:text-ink disabled:opacity-25">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Enrichment terms grid cell (lazy-loaded) ────────────────────────────────

type TermRow = { glossaryId: number; termName: string; domainName: string | null; isPii: boolean; termRole: string };

function EnrichmentTermsCell({ attributeId }: { attributeId: number }) {
  const [terms, setTerms] = useState<TermRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/assets/DATA_ATTRIBUTES/${attributeId}/terms`)
      .then((r) => r.json())
      .then((data: TermRow[]) => setTerms(data.filter((t) => t.termRole === "ENRICHMENT")));
  }, [attributeId]);

  if (terms === null) return <span className="text-muted text-[11px]">…</span>;
  if (terms.length === 0) return <span className="text-muted">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {terms.map((t) => (
        <span key={t.glossaryId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-purple/10 text-brand-deep border border-brand-purple/20">
          {t.termName}
          {t.isPii && <span className="text-[9px] font-bold text-red-600 ml-0.5">PII</span>}
        </span>
      ))}
    </div>
  );
}

// ── Expanded column detail panel ────────────────────────────────────────────

type TagRow = { tagId: number; tagName: string; colorHex: string };

function ColumnDetail({ attr, onEdit, canEdit }: { attr: DataAttribute; onEdit: () => void; canEdit: boolean }) {
  const [tags,            setTags]            = useState<TagRow[]  | null>(null);
  const [enrichment,      setEnrichment]      = useState<TermRow[] | null>(null);
  const [showRelationships, setShowRelationships] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/assets/DATA_ATTRIBUTES/${attr.attributeId}/tags`).then((r) => r.json()),
      fetch(`/api/assets/DATA_ATTRIBUTES/${attr.attributeId}/terms`).then((r) => r.json()),
    ]).then(([tagData, termData]: [TagRow[], TermRow[]]) => {
      setTags(tagData);
      setEnrichment(termData.filter((t) => t.termRole === "ENRICHMENT"));
    });
  }, [attr.attributeId]);

  const hasClassTerm = !!attr.classTermName;

  return (
    <div className="bg-canvas-soft border-b border-line px-6 py-4 space-y-4">
      {/* Description */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">Description</div>
        {(attr.description || attr.sourceDescription)
          ? <p className="text-sm text-ink leading-relaxed">{attr.description ?? attr.sourceDescription}</p>
          : <span className="text-sm text-muted italic">No description</span>}
        {canEdit && <DescriptionEnrichWidget assetType="DATA_ATTRIBUTES" assetId={attr.attributeId} currentText={attr.description ?? null} canEdit={canEdit} />}
      </div>

      {/* Metadata row */}
      <div className="flex items-start gap-8 flex-wrap">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">Friendly Name</div>
          <div className="text-sm text-ink">{attr.friendlyName ?? <span className="text-muted">—</span>}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">Column Type</div>
          <div className="text-sm text-ink">
            <ColumnTypeBadge
              attributeId={attr.attributeId} physicalName={attr.physicalName}
              currentType={attr.columnType} suggestedType={attr.suggestedColumnType}
              confidence={attr.columnTypeConfidence} status={attr.columnTypeStatus}
              canEdit={canEdit}
            />
            {!attr.columnType && !attr.suggestedColumnType && <span className="text-muted">—</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">Encrypted</div>
          <div className="text-sm">
            {attr.isEncrypted
              ? <span className="font-semibold text-amber-700">🔒 Yes</span>
              : <span className="text-muted">No</span>}
          </div>
        </div>
      </div>

      {/* Classification term */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-brand-purple mb-2">Classification Term</div>
        {hasClassTerm ? (
          <div className="flex items-center gap-6 flex-wrap text-sm bg-white border border-brand-purple/15 rounded-lg px-4 py-2.5">
            <div>
              <span className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Term</span>
              <span className="font-semibold text-brand-deep">{attr.classTermName}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Classification</span>
              <div className="flex items-center gap-1.5">
                <ClassificationTag code={attr.classTermClassCode ?? undefined} />
                {attr.classTermClassName && (
                  <span className="text-[12px] text-ink">{attr.classTermClassName}</span>
                )}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">PII</span>
              {attr.classTermIsPii
                ? <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">Yes</span>
                : <span className="text-sm text-muted">No</span>}
            </div>
            <div>
              <span className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">CDE</span>
              {isCde(attr)
                ? <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">Yes — Critical Data Element</span>
                : <span className="text-sm text-muted">No</span>}
            </div>
            <div>
              <span className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">PI Category</span>
              {attr.classTermPiCategoryName
                ? <span className="text-[12px] font-medium text-ink">{attr.classTermPiCategoryName}</span>
                : <span className="text-sm text-muted">—</span>}
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted italic">No classification term linked</span>
        )}
      </div>

      {/* Enrichment terms */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">Business Terms (Enrichment)</div>
        {enrichment === null
          ? <span className="text-[11px] text-muted">Loading…</span>
          : enrichment.length === 0
          ? <span className="text-sm text-muted italic">None linked</span>
          : (
            <div className="flex flex-wrap gap-1.5">
              {enrichment.map((t) => (
                <span key={t.glossaryId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple/10 text-brand-deep border border-brand-purple/20">
                  {t.termName}
                  {t.isPii && <span className="text-[9px] font-bold text-red-600 ml-0.5">PII</span>}
                </span>
              ))}
            </div>
          )}
      </div>

      {/* Tags */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">Tags</div>
        {tags === null
          ? <span className="text-[11px] text-muted">Loading…</span>
          : tags.length === 0
          ? <span className="text-sm text-muted italic">No tags</span>
          : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag.tagId}
                  style={{ backgroundColor: tag.colorHex + "22", borderColor: tag.colorHex + "66", color: tag.colorHex }}
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold border">
                  {tag.tagName}
                </span>
              ))}
            </div>
          )}
      </div>

      {/* Related custom assets */}
      <RelatedAssetsPanel assetTypeCode="DATA_ATTRIBUTES" assetId={attr.attributeId} compact />

      {/* Action row */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setShowRelationships((v) => !v)}
          className={`btn btn-sm flex items-center gap-1.5 ${showRelationships ? "bg-brand-purple/10 border-brand-purple/40 text-brand-purple" : ""}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
            <line x1="12" y1="8" x2="5.5" y2="16"/><line x1="12" y1="8" x2="18.5" y2="16"/>
          </svg>
          {showRelationships ? "Hide Relationships" : "View Relationships"}
        </button>
        <button onClick={onEdit} className="btn btn-sm btn-primary">Edit Column</button>
      </div>

      {/* Inline relationship diagram */}
      {showRelationships && (
        <div className="mt-2 -mx-6 -mb-4 border-t border-line pt-4 px-6 pb-4">
          <MindMapTab
            assetId={attr.attributeId}
            assetType="DATA_ATTRIBUTES"
            entityName={attr.physicalName}
            height={450}
          />
        </div>
      )}
    </div>
  );
}

// ── Attribute edit modal ────────────────────────────────────────────────────

function AttributeEditModal({ attr, onClose }: { attr: DataAttribute; onClose: () => void }) {
  const router = useRouter();
  const { t } = useLang();
  const c = t.catalog;
  const [description,  setDescription]  = useState(attr.description  ?? "");
  const [friendlyName, setFriendlyName] = useState(attr.friendlyName ?? "");
  const [isEncrypted,  setIsEncrypted]  = useState(attr.isEncrypted  ?? false);
  const [columnType,   setColumnType]   = useState(attr.columnType   ?? "");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [showHistory,  setShowHistory]  = useState(false);

  const COLUMN_TYPE_OPTIONS = [
    { value: "",          label: "— None —" },
    { value: "BUSINESS",  label: "Business Column" },
    { value: "TECHNICAL", label: "Technical Column" },
  ];

  async function save() {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/catalog/attributes/${attr.attributeId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, friendlyName, isEncrypted, columnType: columnType || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save"); return;
      }
      onClose(); router.refresh();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <div>
              <h2 className="font-bold text-brand-deep">{attr.physicalName}</h2>
              <p className="text-[11px] text-muted font-mono">{attr.dataType}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowHistory(true)} className="text-[11px] text-brand-purple hover:underline font-medium">{c.viewHistory}</button>
              <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none ml-2">&times;</button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="field-label">{t.common.description}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" placeholder="Describe this column…" />
              <div className="mt-2 rounded-md bg-canvas-soft border border-line px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-0.5">{c.fromSource}</div>
                {attr.sourceDescription
                  ? <p className="text-[12px] text-ink-soft leading-relaxed">{attr.sourceDescription}</p>
                  : <p className="text-[12px] text-muted italic">No comment found in source database.</p>}
              </div>
            </div>

            <div>
              <label className="field-label">{c.editFriendlyName}</label>
              <input type="text" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} className="input-field" placeholder="e.g. Customer Identifier" />
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="field-label">{c.columnTypeLabel}</label>
                <select value={columnType} onChange={(e) => setColumnType(e.target.value)} className="input-field">
                  {COLUMN_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2.5 pb-2.5">
                <input type="checkbox" id="col-encrypted" checked={isEncrypted} onChange={(e) => setIsEncrypted(e.target.checked)} className="w-4 h-4 rounded accent-brand-purple" />
                <label htmlFor="col-encrypted" className="text-sm text-ink cursor-pointer select-none">{c.encryptedField}</label>
              </div>
            </div>

            <div>
              <label className="field-label">{c.tagsLabel}</label>
              <TagPicker assetType="DATA_ATTRIBUTES" assetId={attr.attributeId} />
            </div>

            <div>
              <label className="field-label">{c.businessTerms}</label>
              <TermMultiPicker assetType="DATA_ATTRIBUTES" assetId={attr.attributeId} dual />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
            <button onClick={onClose} className="btn">{t.common.cancel}</button>
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? t.common.saving : c.saveChanges}</button>
          </div>
        </div>
      </div>

      {showHistory && (
        <AssetHistoryDrawer assetType="DATA_ATTRIBUTES" assetId={attr.attributeId} assetName={attr.physicalName} onClose={() => setShowHistory(false)} />
      )}
    </>
  );
}

// ── Main ColumnsTable ───────────────────────────────────────────────────────

export function ColumnsTable({ attributes, canEdit }: { attributes: DataAttribute[]; canEdit: boolean }) {
  const { t } = useLang();
  const g = t.catalog;

  const [editing,      setEditing]      = useState<DataAttribute | null>(null);
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [activeColIds, setActiveColIds] = useState<GridColId[]>(DEFAULT_COLS);

  // Load localStorage prefs on mount (client only)
  useEffect(() => { setActiveColIds(loadColPrefs()); }, []);

  const activeColDefs = activeColIds
    .map((id) => ALL_GRID_COLS.find((c) => c.id === id))
    .filter(Boolean) as GridColDef[];

  // CSS grid template: expand chevron | PK/FK | ...dynamic cols... | edit (optional)
  const gridTemplate = [
    "28px",
    "36px",
    ...activeColDefs.map((c) => c.width),
    canEdit ? "36px" : null,
  ].filter(Boolean).join(" ");

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      {editing && <AttributeEditModal attr={editing} onClose={() => setEditing(null)} />}

      <div className="card overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h3 className="font-bold">
            {g.columns}
            <span className="text-muted text-xs font-normal ml-1.5">{attributes.length} {g.attributes}</span>
          </h3>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm">{g.filterBtn}</button>
            <button className="btn btn-sm">{g.sortBtn}</button>
            <ColumnChooser activeColIds={activeColIds} onChange={setActiveColIds} />
            {canEdit && <button className="btn btn-sm">{t.common.edit}</button>}
          </div>
        </div>

        {/* Header row */}
        <div
          style={{ gridTemplateColumns: gridTemplate }}
          className="grid gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold"
        >
          <div />
          <div />
          {activeColDefs.map((col) => <div key={col.id}>{col.label}</div>)}
          {canEdit && <div />}
        </div>

        {/* Data rows */}
        {attributes.map((a) => (
          <div key={a.attributeId}>
            {/* Main row */}
            <div
              style={{ gridTemplateColumns: gridTemplate }}
              className="grid gap-3 px-5 py-3.5 items-start text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors cursor-pointer"
              onClick={() => toggleExpand(a.attributeId)}
            >
              {/* Expand chevron — top-aligned with a nudge */}
              <div className="flex items-center justify-center pt-0.5">
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`text-muted transition-transform shrink-0 ${expandedId === a.attributeId ? "rotate-90" : ""}`}
                >
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>

              {/* PK / FK indicator */}
              <div className="pt-0.5">
                {a.isPrimaryKey ? (
                  <span className="w-[22px] h-[22px] grid place-items-center bg-brand-purple/10 text-brand-purple rounded text-[10px] font-bold">PK</span>
                ) : a.physicalName.endsWith("_id") ? (
                  <span className="w-[22px] h-[22px] grid place-items-center bg-brand-light/30 text-brand-navy rounded text-[10px] font-bold">FK</span>
                ) : null}
              </div>

              {/* Dynamic columns — every cell needs min-w-0 to honour fr widths */}
              {activeColDefs.map((col) => {
                switch (col.id) {
                  case "name":
                    return (
                      <div key="name" className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-brand-deep truncate">{a.physicalName}</span>
                          {a.isEncrypted && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">🔒 Enc</span>}
                          {a.columnType && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">{COLUMN_TYPE_LABEL[a.columnType] ?? a.columnType}</span>}
                          {!a.columnType && a.suggestedColumnType && (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-dashed border-amber-400 bg-amber-50 text-amber-700 shrink-0"
                              title={t.catalog.suggestedColumnTypeTitle}
                            >
                              {t.catalog.suggestedTypePrefix} {a.suggestedColumnType === "BUSINESS" ? t.catalog.columnTypeBusiness : t.catalog.columnTypeTechnical}
                            </span>
                          )}
                          {a.classTermIsPii && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 shrink-0">PII</span>}
                          {isCde(a) && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0">CDE</span>}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5 line-clamp-2 break-words">
                          {a.description ?? a.sourceDescription ?? a.friendlyName ?? "—"}
                        </div>
                      </div>
                    );
                  case "type":
                    return <div key="type" className="min-w-0 font-mono text-[12px] text-ink-soft truncate">{a.dataType}</div>;
                  case "nullpct":
                    return <div key="nullpct" className="min-w-0">{a.nullPercentage != null ? `${Number(a.nullPercentage).toFixed(1)}%` : "—"}</div>;
                  case "sensitivity":
                    return <div key="sensitivity" className="min-w-0"><ClassificationTag code={a.classTermClassCode ?? a.classificationCode} /></div>;
                  case "classTerm":
                    return (
                      <div key="classTerm" className="min-w-0 text-[12px] text-ink-soft truncate">
                        {a.classTermName ?? <span className="text-muted">—</span>}
                      </div>
                    );
                  case "enrichTerms":
                    return (
                      <div key="enrichTerms" className="min-w-0">
                        <EnrichmentTermsCell attributeId={a.attributeId} />
                      </div>
                    );
                  case "glossary":
                    return (
                      <div key="glossary" className="min-w-0 space-y-1">
                        {a.glossaryTerm ? <Tag variant="blue">{a.glossaryTerm}</Tag> : <span className="text-muted">—</span>}
                        {a.retentionCategoryName && (
                          <div className="flex items-center gap-1 text-[9px] text-brand-purple font-medium">
                            <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 shrink-0 opacity-60"><path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm0 2a.75.75 0 1 1 0 1.5A.75.75 0 0 1 6 2zm.75 7.5h-1.5V5.25h1.5V9.5z"/></svg>
                            <span className="truncate" title={a.retentionCategoryName}>{a.retentionCategoryName}</span>
                          </div>
                        )}
                      </div>
                    );
                  case "quality":
                    return (
                      <div key="quality" className="min-w-0">
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
                    );
                  case "friendly":
                    return <div key="friendly" className="min-w-0 text-[12px] text-ink-soft truncate">{a.friendlyName ?? <span className="text-muted">—</span>}</div>;
                  case "coltype":
                    return (
                      <div key="coltype" className="min-w-0">
                        <ColumnTypeBadge
                          attributeId={a.attributeId} physicalName={a.physicalName}
                          currentType={a.columnType} suggestedType={a.suggestedColumnType}
                          confidence={a.columnTypeConfidence} status={a.columnTypeStatus}
                          canEdit={canEdit}
                        />
                        {!a.columnType && !a.suggestedColumnType && <span className="text-muted">—</span>}
                      </div>
                    );
                  case "encrypted":
                    return (
                      <div key="encrypted" className="min-w-0">
                        {a.isEncrypted
                          ? <span className="text-[11px] font-bold text-amber-700">🔒 Yes</span>
                          : <span className="text-muted text-[12px]">—</span>}
                      </div>
                    );
                  case "pii":
                    return (
                      <div key="pii" className="min-w-0">
                        {a.classTermIsPii
                          ? <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">Yes</span>
                          : a.classTermName
                          ? <span className="text-muted text-[12px]">No</span>
                          : <span className="text-muted text-[12px]">—</span>}
                      </div>
                    );
                  case "picategory":
                    return (
                      <div key="picategory" className="min-w-0 text-[12px] text-ink-soft truncate">
                        {a.classTermPiCategoryName ?? <span className="text-muted">—</span>}
                      </div>
                    );
                  case "cde":
                    return (
                      <div key="cde" className="min-w-0">
                        {isCde(a) ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">CDE</span>
                        ) : a.classTermClassCode || a.classificationCode ? (
                          <span className="text-muted text-[12px]">No</span>
                        ) : (
                          <span className="text-muted text-[12px]">—</span>
                        )}
                      </div>
                    );
                  default:
                    return <div key={col.id} />;
                }
              })}

              {/* Edit button */}
              {canEdit && (
                <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
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

            {/* Expanded detail */}
            {expandedId === a.attributeId && (
              <ColumnDetail attr={a} onEdit={() => { setExpandedId(null); setEditing(a); }} canEdit={canEdit} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
