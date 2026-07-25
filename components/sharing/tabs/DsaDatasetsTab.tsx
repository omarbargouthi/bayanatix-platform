"use client";

import { useState, useEffect, useCallback } from "react";
import type { DsaDataset, DsaAttribute } from "@/lib/queries/sharing";
import type { ColumnDqRule } from "@/app/api/open-data/column-dq/route";

type Entity       = { entityId: number; entityName: string; schemaName: string; sourceName: string };
type ClassTerm    = { glossaryId: number; termName: string; classCode: string };
type AttrOption   = {
  attributeId: number; physicalName: string; friendlyName: string | null;
  liveClassCode: string | null; liveIsPii: boolean;
  dqScore: number | null; dqRuleCount: number;
};

const TREATMENT_LABELS: Record<string,string> = {
  AS_IS:"As-Is", MASKED:"Masked", ANONYMIZED:"Anonymized",
  PSEUDONYMIZED:"Pseudonymized", AGGREGATED:"Aggregated",
};

function DqScoreBadge({ score, ruleCount }: { score: number | null; ruleCount: number }) {
  if (score == null) {
    return ruleCount > 0
      ? <span className="text-[10px] text-slate-400 italic">Not scored</span>
      : <span className="text-[11px] text-slate-400">—</span>;
  }
  const pct   = Math.round(score);
  const color = pct >= 80
    ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : pct >= 50
    ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-red-600 bg-red-50 border-red-200";
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>{pct}%</span>;
}

function RuleStatusBadge({ status, score }: { status: string | null; score: number | null }) {
  if (!status) return <span className="text-[10px] text-slate-400">Not run</span>;
  const cfg = status === "PASSED"
    ? { bg: "bg-emerald-50 text-emerald-700", icon: "✓" }
    : status === "FAILED"
    ? { bg: "bg-red-50 text-red-600",     icon: "✗" }
    : { bg: "bg-slate-100 text-slate-500",  icon: "!" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg}`}>
      <span>{cfg.icon}</span>
      {status}
      {score != null && <span className="opacity-70">({Math.round(score)}%)</span>}
    </span>
  );
}

const CLASS_COLORS: Record<string,string> = {
  PUBLIC:"bg-green-100 text-green-700", INTERNAL:"bg-blue-100 text-blue-700",
  CONFIDENTIAL:"bg-amber-100 text-amber-700", RESTRICTED:"bg-amber-100 text-amber-700",
  SECRET:"bg-red-100 text-red-700", TOP_SECRET:"bg-gray-800 text-white",
};

type Props = {
  dsaId:         number;
  datasets:      DsaDataset[];
  directionCode: string;
  isEditable:    boolean;
  canClassify:   boolean;
  onChanged:     () => void;
};

export function DsaDatasetsTab({ dsaId, datasets, directionCode, isEditable, canClassify, onChanged }: Props) {
  const outbound = datasets.filter(d => d.datasetDirection === "OUTBOUND");
  const inbound  = datasets.filter(d => d.datasetDirection === "INBOUND");

  const showOutbound = directionCode === "PROVIDER"  || directionCode === "BIDIRECTIONAL";
  const showInbound  = directionCode === "REQUESTER" || directionCode === "BIDIRECTIONAL";

  // Attribute panel state
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [attrMap,  setAttrMap]    = useState<Record<number, DsaAttribute[]>>({});

  // Classification terms (lazy-loaded)
  const [classTerms,      setClassTerms]      = useState<ClassTerm[] | null>(null);
  const [classifyingAttr, setClassifyingAttr] = useState<number | null>(null); // attrId being classified
  const [classifyBusy,    setClassifyBusy]    = useState(false);

  // DQ rules per attribute (attributeId → rules), fetched lazily — same source as Open Data
  const [dqRules,      setDqRules]      = useState<Record<number, ColumnDqRule[]>>({});
  const [dqLoading,    setDqLoading]    = useState<Record<number, boolean>>({});

  async function fetchDqRules(attributeId: number) {
    if (dqRules[attributeId] !== undefined) return;
    setDqLoading(p => ({ ...p, [attributeId]: true }));
    try {
      const r = await fetch(`/api/open-data/column-dq?attributeId=${attributeId}`);
      const data = await r.json();
      setDqRules(p => ({ ...p, [attributeId]: Array.isArray(data) ? data : [] }));
    } finally {
      setDqLoading(p => ({ ...p, [attributeId]: false }));
    }
  }

  // Outbound picker modal
  const [showPicker,     setShowPicker]     = useState(false);
  const [entities,       setEntities]       = useState<Entity[]>([]);
  const [entitySearch,   setEntitySearch]   = useState("");
  const [pickedEntityId, setPickedEntityId] = useState<number | null>(null);
  const [attrOptions,    setAttrOptions]    = useState<AttrOption[]>([]);
  const [selectedAttrs,  setSelectedAttrs]  = useState<Set<number>>(new Set());
  const [addingOut,      setAddingOut]      = useState(false);
  const [outboundError,  setOutboundError]  = useState<string | null>(null);

  // Inbound form
  const [showInboundForm, setShowInboundForm] = useState(false);
  const [inboundName,     setInboundName]     = useState("");
  const [inboundDesc,     setInboundDesc]     = useState("");
  const [addingIn,        setAddingIn]        = useState(false);

  // Assign-to-catalog modal for inbound datasets
  const [assigningDatasetId, setAssigningDatasetId] = useState<number | null>(null);
  const [assignEntities,     setAssignEntities]     = useState<Entity[]>([]);
  const [assignSearch,       setAssignSearch]       = useState("");
  const [assignBusy,         setAssignBusy]         = useState(false);

  // ── Load attributes for a dataset row ────────────────────────────────────
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
    setAttrMap(m => { const n = { ...m }; delete n[dsaDatasetId]; return n; });
    onChanged();
  }

  // ── Classification terms (load once on first click) ───────────────────────
  async function ensureClassTerms() {
    if (classTerms !== null) return classTerms;
    const r = await fetch("/api/sharing/class-terms");
    const data: ClassTerm[] = await r.json();
    setClassTerms(data);
    return data;
  }

  async function assignClassification(attributeId: number, glossaryId: number, dsaDatasetId: number) {
    setClassifyBusy(true);
    await fetch("/api/classification/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributeIds: [attributeId], classificationId: glossaryId }),
    });
    setClassifyBusy(false);
    setClassifyingAttr(null);
    // Refresh attrs for this dataset
    setAttrMap(m => { const n = { ...m }; delete n[dsaDatasetId]; return n; });
    loadAttrs(dsaDatasetId);
  }

  // ── Outbound catalog picker ───────────────────────────────────────────────
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
      .then((attrs: AttrOption[]) => setAttrOptions(attrs))
      .catch(() => setAttrOptions([]));
  }, [pickedEntityId]);

  async function confirmAddOutbound() {
    if (!pickedEntityId || selectedAttrs.size === 0) return;
    setAddingOut(true);
    setOutboundError(null);
    try {
      const r = await fetch(`/api/sharing/dsas/${dsaId}/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetDirection: "OUTBOUND",
          entityId: pickedEntityId,
          attributeIds: [...selectedAttrs],
        }),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        setOutboundError(payload.error ?? `Server error (HTTP ${r.status})`);
        return;
      }
      setShowPicker(false);
      setPickedEntityId(null);
      setSelectedAttrs(new Set());
      setAttrMap({});
      onChanged();
    } catch {
      setOutboundError("Network error — please try again.");
    } finally {
      setAddingOut(false);
    }
  }

  // ── Inbound manual add ────────────────────────────────────────────────────
  async function confirmAddInbound() {
    if (!inboundName.trim()) return;
    setAddingIn(true);
    await fetch(`/api/sharing/dsas/${dsaId}/datasets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetDirection: "INBOUND",
        inboundNameText: inboundName.trim(),
        inboundDescriptionText: inboundDesc.trim() || null,
      }),
    });
    setAddingIn(false);
    setShowInboundForm(false);
    setInboundName("");
    setInboundDesc("");
    onChanged();
  }

  // ── Assign catalog entity to inbound dataset ──────────────────────────────
  useEffect(() => {
    if (assigningDatasetId === null) return;
    const q = encodeURIComponent(assignSearch);
    fetch(`/api/sharing/entities?search=${q}&limit=30`)
      .then(r => r.json())
      .then(data => setAssignEntities(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => setAssignEntities([]));
  }, [assigningDatasetId, assignSearch]);

  async function assignCatalogEntity(dsaDatasetId: number, entityId: number) {
    setAssignBusy(true);
    await fetch(`/api/sharing/dsas/${dsaId}/datasets?dsaDatasetId=${dsaDatasetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inboundEntityId: entityId }),
    });
    setAssignBusy(false);
    setAssigningDatasetId(null);
    setAssignSearch("");
    setAttrMap(m => { const n = { ...m }; delete n[dsaDatasetId]; return n; });
    onChanged();
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderAttributeRow(attr: DsaAttribute, dsaDatasetId: number) {
    const effectiveClass = attr.classificationCodeSnapshot ?? attr.liveClassCode;
    const unclassified   = !effectiveClass;
    const isClassifying  = classifyingAttr === attr.attributeId;
    const rules          = dqRules[attr.attributeId];
    const rulesLoading   = dqLoading[attr.attributeId];

    return (
      <div key={attr.dsaAttributeId} className="border-b border-line-soft last:border-0">
        <div className="grid grid-cols-[1fr_130px_60px_100px_120px] gap-2 px-5 py-2.5 items-center">
          <div>
            <div className="text-sm font-medium text-ink">{attr.physicalName}</div>
            {attr.friendlyName && <div className="text-[11px] text-muted">{attr.friendlyName}</div>}
          </div>
          <div className="flex items-center gap-1.5">
            {effectiveClass
              ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${CLASS_COLORS[effectiveClass] ?? "bg-gray-100 text-gray-600"}`}>{effectiveClass}</span>
              : <span className="text-[10px] text-red-500 italic font-medium">Unclassified</span>}
            {unclassified && canClassify && !isClassifying && (
              <button
                onClick={async () => {
                  await ensureClassTerms();
                  setClassifyingAttr(attr.attributeId);
                }}
                className="text-[10px] text-blue-600 hover:underline shrink-0"
              >
                Classify
              </button>
            )}
          </div>
          <div className="text-[11px]">
            {(attr.isPersonalData || attr.liveIsPii)
              ? <span className="text-purple-600 font-medium">PI</span>
              : <span className="text-muted">—</span>}
          </div>
          <div className="text-[11px] text-muted">
            {TREATMENT_LABELS[attr.treatmentCode] ?? attr.treatmentCode}
          </div>
          <div className="flex items-center gap-1.5">
            <DqScoreBadge score={attr.dqScore} ruleCount={attr.dqRuleCount} />
            {attr.dqRuleCount > 0 && (
              <button
                onClick={() => fetchDqRules(attr.attributeId)}
                className="text-[10px] text-sky-600 hover:underline shrink-0"
              >
                {rules !== undefined ? "hide" : `${attr.dqRuleCount} rule${attr.dqRuleCount > 1 ? "s" : ""} ↓`}
              </button>
            )}
          </div>
        </div>

        {/* DQ rules panel */}
        {rulesLoading && (
          <div className="mx-5 mb-2 text-[11px] text-slate-400 animate-pulse">Loading DQ rules…</div>
        )}
        {rules && rules.length > 0 && (
          <div className="mx-5 mb-3 p-3 bg-sky-50/60 border border-sky-100 rounded-lg space-y-1.5">
            {rules.map(rule => (
              <div key={rule.ruleId} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-[11px] font-medium text-slate-700 truncate">{rule.ruleName}</span>
                  {rule.dimensionName && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{rule.dimensionName}</span>
                  )}
                </div>
                <RuleStatusBadge status={rule.lastStatus} score={rule.lastScore} />
              </div>
            ))}
          </div>
        )}

        {/* Inline classification panel */}
        {isClassifying && classTerms && (
          <div className="mx-5 mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center gap-3">
            <span className="text-[11px] text-blue-700 font-semibold shrink-0">Assign classification:</span>
            <select
              className="input input-sm flex-1 text-[12px]"
              defaultValue=""
              onChange={async e => {
                const val = Number(e.target.value);
                if (!val) return;
                await assignClassification(attr.attributeId, val, dsaDatasetId);
              }}
              disabled={classifyBusy}
            >
              <option value="">— Select term —</option>
              {classTerms.map(t => (
                <option key={t.glossaryId} value={t.glossaryId}>
                  {t.termName} ({t.classCode})
                </option>
              ))}
            </select>
            <button
              onClick={() => setClassifyingAttr(null)}
              className="text-[11px] text-muted hover:text-ink"
              disabled={classifyBusy}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderDatasetCard(ds: DsaDataset, type: "OUTBOUND" | "INBOUND") {
    const label  = type === "OUTBOUND"
      ? (ds.entityName ?? "Unknown entity")
      : (ds.inboundNameText ?? "Unnamed");
    const sublabel = type === "OUTBOUND"
      ? `${ds.sourceName ?? ""} › ${ds.schemaName ?? ""}`
      : (ds.inboundDescriptionText ?? "");

    return (
      <div key={ds.dsaDatasetId} className="card overflow-hidden">
        <div
          className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-canvas-soft"
          onClick={() => type === "OUTBOUND" && toggleExpand(ds.dsaDatasetId)}
        >
          {type === "OUTBOUND" && (
            <span className="text-muted text-[11px]">{expanded === ds.dsaDatasetId ? "▼" : "▶"}</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-ink">{label}</div>
            {sublabel && <div className="text-[11px] text-muted truncate">{sublabel}</div>}
            {type === "INBOUND" && (
              <div className="mt-1 flex items-center gap-2">
                {ds.inboundEntityId
                  ? <span className="text-[10px] text-green-600 font-medium">Linked: {ds.inboundEntityName}</span>
                  : isEditable
                    ? <button
                        onClick={e => { e.stopPropagation(); setAssigningDatasetId(ds.dsaDatasetId); setAssignSearch(""); }}
                        className="text-[10px] text-brand-purple hover:underline font-medium"
                      >+ Assign to catalog entity</button>
                    : <span className="text-[10px] text-amber-600 italic">Not yet linked to catalog</span>
                }
              </div>
            )}
          </div>
          {type === "OUTBOUND" && (
            <span className="text-[11px] text-muted">{ds.attributeCount} attributes</span>
          )}
          {isEditable && (
            <button
              onClick={e => { e.stopPropagation(); removeDataset(ds.dsaDatasetId); }}
              className="text-[11px] text-red-400 hover:text-red-600 px-2"
            >
              Remove
            </button>
          )}
        </div>

        {type === "OUTBOUND" && expanded === ds.dsaDatasetId && (
          <div className="border-t border-line">
            {!attrMap[ds.dsaDatasetId] ? (
              <div className="p-4 text-muted text-sm">Loading…</div>
            ) : attrMap[ds.dsaDatasetId].length === 0 ? (
              <div className="p-4 text-muted text-sm italic">No attributes selected.</div>
            ) : (
              <div>
                <div className="grid grid-cols-[1fr_130px_60px_100px_120px] gap-2 px-5 py-2 bg-canvas-soft text-[10px] uppercase tracking-wider text-muted font-bold border-b border-line">
                  <div>Attribute</div>
                  <div>Classification</div>
                  <div>PI</div>
                  <div>Treatment</div>
                  <div>DQ</div>
                </div>
                {attrMap[ds.dsaDatasetId].map(attr => renderAttributeRow(attr, ds.dsaDatasetId))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-8">

      {/* ── OUTBOUND section ── */}
      {showOutbound && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-ink text-sm">Outbound — Data We Share</h2>
              <p className="text-xs text-muted mt-0.5">Select catalog entities and explicitly pick each attribute to be shared.</p>
            </div>
            {isEditable && (
              <button onClick={() => setShowPicker(true)} className="btn btn-primary btn-sm">+ Add from Catalog</button>
            )}
          </div>

          {outbound.length === 0 ? (
            <div className="card p-8 text-center text-muted text-sm">
              No outbound datasets yet.{isEditable && " Click \"Add from Catalog\" to select tables."}
            </div>
          ) : (
            <div className="space-y-3">
              {outbound.map(ds => renderDatasetCard(ds, "OUTBOUND"))}
            </div>
          )}
        </section>
      )}

      {/* ── INBOUND section ── */}
      {showInbound && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-ink text-sm">Inbound — Data We Receive</h2>
              <p className="text-xs text-muted mt-0.5">
                Describe data you will receive. Once it lands in your data sources, link it to a catalog entity.
              </p>
            </div>
            {isEditable && !showInboundForm && (
              <button onClick={() => setShowInboundForm(true)} className="btn btn-primary btn-sm">+ Add Inbound Dataset</button>
            )}
          </div>

          {showInboundForm && (
            <div className="card p-5 mb-4 space-y-4 border-2 border-dashed border-brand-purple/30">
              <h3 className="font-medium text-sm text-ink">Describe the inbound data</h3>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Dataset Name <span className="text-red-500">*</span></label>
                <input
                  className="input w-full"
                  placeholder="e.g. Employee Demographics from HRSD"
                  value={inboundName}
                  onChange={e => setInboundName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Description</label>
                <textarea
                  className="input w-full h-16 resize-none"
                  placeholder="What data is expected, format, frequency…"
                  value={inboundDesc}
                  onChange={e => setInboundDesc(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowInboundForm(false); setInboundName(""); setInboundDesc(""); }} className="btn btn-sm">Cancel</button>
                <button
                  onClick={confirmAddInbound}
                  disabled={addingIn || !inboundName.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {addingIn ? "Adding…" : "Add Inbound Dataset"}
                </button>
              </div>
            </div>
          )}

          {inbound.length === 0 && !showInboundForm ? (
            <div className="card p-8 text-center text-muted text-sm">
              No inbound datasets yet.{isEditable && " Click \"Add Inbound Dataset\" to describe what you will receive."}
            </div>
          ) : (
            <div className="space-y-3">
              {inbound.map(ds => renderDatasetCard(ds, "INBOUND"))}
            </div>
          )}
        </section>
      )}

      {/* ── Outbound catalog picker modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <h3 className="font-semibold text-ink">Add Outbound Dataset</h3>
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
                          {!attr.liveClassCode && (
                            <span className="text-[9px] text-red-500 italic shrink-0">Unclassified</span>
                          )}
                          {attr.liveIsPii && <span className="text-[9px] text-purple-600 font-semibold shrink-0">PI</span>}
                          <span className="shrink-0"><DqScoreBadge score={attr.dqScore} ruleCount={attr.dqRuleCount} /></span>
                        </label>
                      ))}
                      {attrOptions.length === 0 && <div className="p-4 text-muted text-sm italic">No attributes found</div>}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-3">
              <div className="flex-1">
                {outboundError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">{outboundError}</p>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => { setShowPicker(false); setPickedEntityId(null); setSelectedAttrs(new Set()); setOutboundError(null); }} className="btn">Cancel</button>
                <button
                  onClick={confirmAddOutbound}
                  disabled={addingOut || !pickedEntityId || selectedAttrs.size === 0}
                  className="btn btn-primary"
                >
                  {addingOut ? "Adding…" : `Add ${selectedAttrs.size} attribute${selectedAttrs.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign to catalog modal ── */}
      {assigningDatasetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[60vh] flex flex-col">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <h3 className="font-semibold text-ink">Link to Catalog Entity</h3>
              <button onClick={() => { setAssigningDatasetId(null); setAssignSearch(""); }} className="text-muted hover:text-ink text-xl">×</button>
            </div>
            <div className="p-4 border-b border-line">
              <input
                className="input w-full"
                placeholder="Search catalog tables…"
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {assignEntities.map(e => (
                <button
                  key={e.entityId}
                  onClick={() => assignCatalogEntity(assigningDatasetId, e.entityId)}
                  disabled={assignBusy}
                  className="w-full text-left px-5 py-3 border-b border-line-soft hover:bg-canvas-soft text-sm"
                >
                  <div className="font-medium text-ink">{e.entityName}</div>
                  <div className="text-[11px] text-muted">{e.sourceName} › {e.schemaName}</div>
                </button>
              ))}
              {assignEntities.length === 0 && (
                <div className="p-5 text-muted text-sm italic text-center">Search for a table above</div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-line text-right">
              <button onClick={() => { setAssigningDatasetId(null); setAssignSearch(""); }} className="btn btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
