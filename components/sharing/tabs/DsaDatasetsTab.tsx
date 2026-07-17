"use client";

import { useState, useEffect, useCallback } from "react";
import type { DsaDataset, DsaAttribute } from "@/lib/queries/sharing";

type Entity = { entityId: number; entityName: string; schemaName: string; sourceName: string };

const TREATMENT_LABELS: Record<string,string> = {
  AS_IS:"As-Is", MASKED:"Masked", ANONYMIZED:"Anonymized",
  PSEUDONYMIZED:"Pseudonymized", AGGREGATED:"Aggregated",
};

const CLASS_COLORS: Record<string,string> = {
  PUBLIC:"bg-green-100 text-green-700", INTERNAL:"bg-blue-100 text-blue-700",
  CONFIDENTIAL:"bg-amber-100 text-amber-700", RESTRICTED:"bg-amber-100 text-amber-700",
  SECRET:"bg-red-100 text-red-700", TOP_SECRET:"bg-gray-800 text-white",
};

type Props = {
  dsaId:      number;
  datasets:   DsaDataset[];
  isEditable: boolean;
  onChanged:  () => void;
};

export function DsaDatasetsTab({ dsaId, datasets, isEditable, onChanged }: Props) {
  const [expanded,       setExpanded]       = useState<number | null>(null);
  const [attrMap,        setAttrMap]        = useState<Record<number, DsaAttribute[]>>({});
  const [showPicker,     setShowPicker]     = useState(false);
  const [entities,       setEntities]       = useState<Entity[]>([]);
  const [entitySearch,   setEntitySearch]   = useState("");
  const [pickedEntityId, setPickedEntityId] = useState<number | null>(null);
  const [attrOptions,    setAttrOptions]    = useState<{ attributeId: number; physicalName: string; friendlyName: string | null; liveClassCode: string | null; liveIsPii: boolean }[]>([]);
  const [selectedAttrs,  setSelectedAttrs]  = useState<Set<number>>(new Set());
  const [adding,         setAdding]         = useState(false);

  async function loadAttrs(dsaDatasetId: number) {
    if (attrMap[dsaDatasetId]) return;
    const r = await fetch(`/api/sharing/dsas/${dsaId}/datasets?dsaDatasetId=${dsaDatasetId}`);
    const attrs: DsaAttribute[] = await r.json();
    setAttrMap(m => ({ ...m, [dsaDatasetId]: attrs }));
  }

  function toggleExpand(dsaDatasetId: number) {
    if (expanded === dsaDatasetId) { setExpanded(null); return; }
    setExpanded(dsaDatasetId);
    loadAttrs(dsaDatasetId);
  }

  async function removeDataset(dsaDatasetId: number) {
    if (!confirm("Remove this dataset and all its attributes from the agreement?")) return;
    await fetch(`/api/sharing/dsas/${dsaId}/datasets?dsaDatasetId=${dsaDatasetId}`, { method: "DELETE" });
    onChanged();
  }

  // Entity picker
  useEffect(() => {
    if (!showPicker) return;
    const q = encodeURIComponent(entitySearch);
    fetch(`/api/sharing/entities?search=${q}&limit=30`)
      .then(r => r.json())
      .then(data => setEntities(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => setEntities([]));
  }, [showPicker, entitySearch]);

  useEffect(() => {
    if (!pickedEntityId) return;
    fetch(`/api/sharing/entities/${pickedEntityId}`)
      .then(r => r.json())
      .then((attrs: { attributeId: number; physicalName: string; friendlyName: string | null; liveClassCode: string | null; liveIsPii: boolean }[]) => setAttrOptions(attrs))
      .catch(() => setAttrOptions([]));
  }, [pickedEntityId]);

  async function confirmAdd() {
    if (!pickedEntityId || selectedAttrs.size === 0) return;
    setAdding(true);
    await fetch(`/api/sharing/dsas/${dsaId}/datasets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: pickedEntityId, attributeIds: [...selectedAttrs] }),
    });
    setAdding(false);
    setShowPicker(false);
    setPickedEntityId(null);
    setSelectedAttrs(new Set());
    setAttrMap({});
    onChanged();
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-ink">Datasets & Attributes</h2>
          <p className="text-xs text-muted mt-0.5">Explicitly select every attribute to be shared — nothing is implicitly included.</p>
        </div>
        {isEditable && (
          <button onClick={() => setShowPicker(true)} className="btn btn-primary btn-sm">+ Add Dataset</button>
        )}
      </div>

      {datasets.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">
          No datasets added yet. Click "Add Dataset" to select tables and attributes.
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map(ds => (
            <div key={ds.dsaDatasetId} className="card overflow-hidden">
              <div
                className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-canvas-soft"
                onClick={() => toggleExpand(ds.dsaDatasetId)}
              >
                <span className="text-muted text-[11px]">{expanded === ds.dsaDatasetId ? "▼" : "▶"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-ink">{ds.entityName}</div>
                  <div className="text-[11px] text-muted">{ds.sourceName} › {ds.schemaName}</div>
                </div>
                <span className="text-[11px] text-muted">{ds.attributeCount} attributes</span>
                {isEditable && (
                  <button
                    onClick={e => { e.stopPropagation(); removeDataset(ds.dsaDatasetId); }}
                    className="text-[11px] text-red-400 hover:text-red-600 px-2"
                  >Remove</button>
                )}
              </div>

              {expanded === ds.dsaDatasetId && (
                <div className="border-t border-line">
                  {!attrMap[ds.dsaDatasetId] ? (
                    <div className="p-4 text-muted text-sm">Loading…</div>
                  ) : attrMap[ds.dsaDatasetId].length === 0 ? (
                    <div className="p-4 text-muted text-sm italic">No attributes selected.</div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-[1fr_100px_80px_120px] gap-2 px-5 py-2 bg-canvas-soft text-[10px] uppercase tracking-wider text-muted font-bold border-b border-line">
                        <div>Attribute</div>
                        <div>Classification</div>
                        <div>PI</div>
                        <div>Treatment</div>
                      </div>
                      {attrMap[ds.dsaDatasetId].map(attr => (
                        <div key={attr.dsaAttributeId} className="grid grid-cols-[1fr_100px_80px_120px] gap-2 px-5 py-2.5 border-b border-line-soft last:border-0 items-center">
                          <div>
                            <div className="text-sm font-medium text-ink">{attr.physicalName}</div>
                            {attr.friendlyName && <div className="text-[11px] text-muted">{attr.friendlyName}</div>}
                          </div>
                          <div>
                            {(attr.classificationCodeSnapshot ?? attr.liveClassCode)
                              ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${CLASS_COLORS[(attr.classificationCodeSnapshot ?? attr.liveClassCode)!] ?? "bg-gray-100 text-gray-600"}`}>
                                  {attr.classificationCodeSnapshot ?? attr.liveClassCode}
                                </span>
                              : <span className="text-[11px] text-red-500 italic">Unclassified</span>}
                          </div>
                          <div className="text-[11px]">
                            {(attr.isPersonalData || attr.liveIsPii) ? <span className="text-purple-600 font-medium">PI</span> : <span className="text-muted">—</span>}
                          </div>
                          <div className="text-[11px] text-muted">
                            {TREATMENT_LABELS[attr.treatmentCode] ?? attr.treatmentCode}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Dataset picker modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <h3 className="font-semibold text-ink">Add Dataset to Agreement</h3>
              <button onClick={() => { setShowPicker(false); setPickedEntityId(null); setSelectedAttrs(new Set()); }} className="text-muted hover:text-ink text-xl">×</button>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Left: entity search */}
              <div className="w-64 border-r border-line flex flex-col">
                <div className="p-3 border-b border-line">
                  <input
                    className="input w-full input-sm"
                    placeholder="Search tables…"
                    value={entitySearch}
                    onChange={e => setEntitySearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {entities.map(e => (
                    <button
                      key={e.entityId}
                      onClick={() => { setPickedEntityId(e.entityId); setSelectedAttrs(new Set()); }}
                      className={`w-full text-left px-4 py-2.5 border-b border-line-soft text-sm hover:bg-canvas-soft ${pickedEntityId === e.entityId ? "bg-brand-purple/10 font-medium text-brand-deep" : "text-ink"}`}
                    >
                      <div className="truncate">{e.entityName}</div>
                      <div className="text-[10px] text-muted truncate">{e.sourceName} › {e.schemaName}</div>
                    </button>
                  ))}
                  {entities.length === 0 && <div className="p-4 text-muted text-sm italic">No tables found</div>}
                </div>
              </div>

              {/* Right: attribute selection */}
              <div className="flex-1 flex flex-col min-w-0">
                {!pickedEntityId ? (
                  <div className="flex-1 flex items-center justify-center text-muted text-sm">Select a table on the left</div>
                ) : (
                  <>
                    <div className="px-4 py-2.5 border-b border-line text-[11px] font-semibold text-muted uppercase flex items-center justify-between">
                      <span>Select Attributes ({selectedAttrs.size} selected)</span>
                      <button
                        onClick={() => {
                          if (selectedAttrs.size === attrOptions.length) setSelectedAttrs(new Set());
                          else setSelectedAttrs(new Set(attrOptions.map(a => a.attributeId)));
                        }}
                        className="text-brand-purple hover:underline text-[11px]"
                      >
                        {selectedAttrs.size === attrOptions.length ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {attrOptions.map(attr => (
                        <label key={attr.attributeId} className="flex items-center gap-3 px-4 py-2 hover:bg-canvas-soft cursor-pointer border-b border-line-soft">
                          <input
                            type="checkbox"
                            checked={selectedAttrs.has(attr.attributeId)}
                            onChange={() => {
                              const s = new Set(selectedAttrs);
                              s.has(attr.attributeId) ? s.delete(attr.attributeId) : s.add(attr.attributeId);
                              setSelectedAttrs(s);
                            }}
                            className="w-4 h-4 accent-brand-purple"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-ink truncate">{attr.physicalName}</div>
                            {attr.friendlyName && <div className="text-[10px] text-muted truncate">{attr.friendlyName}</div>}
                          </div>
                          {attr.liveClassCode && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${CLASS_COLORS[attr.liveClassCode] ?? "bg-gray-100 text-gray-600"}`}>
                              {attr.liveClassCode}
                            </span>
                          )}
                          {attr.liveIsPii && <span className="text-[9px] text-purple-600 font-semibold shrink-0">PI</span>}
                        </label>
                      ))}
                      {attrOptions.length === 0 && <div className="p-4 text-muted text-sm italic">No attributes found</div>}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-line flex justify-end gap-3">
              <button onClick={() => { setShowPicker(false); setPickedEntityId(null); setSelectedAttrs(new Set()); }} className="btn">Cancel</button>
              <button
                onClick={confirmAdd}
                disabled={adding || !pickedEntityId || selectedAttrs.size === 0}
                className="btn btn-primary"
              >
                {adding ? "Adding…" : `Add ${selectedAttrs.size} attribute${selectedAttrs.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
