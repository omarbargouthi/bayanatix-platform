"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoiCaseDetail } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = { caseData: FoiCaseDetail; currentUser: SessionUser; onChanged: () => void };

const STAGES = [
  { code: "OWNER_IDENTIFICATION",   label: "Owner Identification",    role: "Open Data Officer", desc: "Identify the data owners and responsible parties for the requested information." },
  { code: "SOURCE_MAPPING",         label: "Source Mapping",          role: "Open Data Officer", desc: "Map each requested attribute to a source system column from the catalog, or register a manual source." },
  { code: "CLASSIFICATION_GATE",    label: "Classification Gate",     role: "Open Data Officer", desc: "Verify all mapped columns are PUBLIC or INTERNAL. CONFIDENTIAL or higher will block the request." },
  { code: "QUALITY_GATE",           label: "Quality Gate",            role: "Data Steward",      desc: "Review DQ results for catalog-mapped columns. Flagged issues are documented; officer decides whether to proceed." },
  { code: "TECHNICAL_COMPILATION",  label: "Technical Compilation",   role: "Technical Team",    desc: "Extract and compile the approved dataset. An Open Data dataset record is auto-created at this stage." },
  { code: "OWNER_PACKAGE_APPROVAL", label: "Owner Package Approval",  role: "Data Owner",        desc: "Data owner reviews the compiled package for accuracy and completeness before release." },
  { code: "DMO_RELEASE_APPROVAL",   label: "DMO Release Approval",    role: "DMO Admin",         desc: "DMO Admin gives final approval to release the dataset to the requester." },
  { code: "DELIVERY",               label: "Delivery",                role: "Open Data Officer", desc: "Deliver the approved dataset to the requester and close the case." },
];

const SENSITIVITY_OPTIONS = [
  { code: "PUBLIC",       label: "Public",       color: "text-green-700",  bg: "bg-green-100" },
  { code: "INTERNAL",     label: "Internal",     color: "text-blue-700",   bg: "bg-blue-100" },
  { code: "CONFIDENTIAL", label: "Confidential", color: "text-orange-700", bg: "bg-orange-100" },
  { code: "RESTRICTED",   label: "Restricted",   color: "text-red-700",    bg: "bg-red-100" },
  { code: "SECRET",       label: "Secret",       color: "text-red-900",    bg: "bg-red-200" },
  { code: "TOP_SECRET",   label: "Top Secret",   color: "text-red-900",    bg: "bg-red-300" },
];

const BLOCKED_SENSITIVITIES = new Set(["CONFIDENTIAL","RESTRICTED","SECRET","TOP_SECRET"]);

type ReqAttr = {
  reqAttrId: number;
  name: string;
  description: string | null;
  requestedFormatHint: string | null;
};

type Mapping = {
  mappingId: number;
  reqAttrId: number;
  requestedAttributeName: string;
  sourceType: string;
  dataSourceId: number | null;
  dataSourceName: string | null;
  dataEntityId: number | null;
  dataEntityDisplayName: string | null;
  dataAttributeId: number | null;
  dataAttributeName: string | null;
  dataAttributeDisplayName: string | null;
  dataType: string | null;
  manualSystemName: string | null;
  manualEntityName: string | null;
  manualColumnName: string | null;
  sensitivityCode: string | null;
  sensitivityLabel: string | null;
  catalogClassCode: string | null;
  catalogClassLabel: string | null;
  classificationStatus: string;
  classificationNotes: string | null;
  qualityStatus: string;
  qualityNotes: string | null;
  officerNotes: string | null;
  stewardNotifiedAt: string | null;
  stewardNotificationNotes: string | null;
};

type CatalogItem = {
  id: number;
  name: string;
  displayName?: string;
  dataType?: string;
  classificationCode?: string | null;
  classificationLabel?: string | null;
};

type MapForm = {
  sourceType: string;
  dataSourceId: string;
  dataEntityId: string;
  dataAttributeId: string;
  manualSystemName: string;
  manualEntityName: string;
  manualColumnName: string;
  sensitivityCode: string;
  officerNotes: string;
};

function emptyForm(): MapForm {
  return {
    sourceType: "CATALOG", dataSourceId: "", dataEntityId: "", dataAttributeId: "",
    manualSystemName: "", manualEntityName: "", manualColumnName: "", sensitivityCode: "", officerNotes: "",
  };
}

function SensChip({ code }: { code: string | null }) {
  if (!code) return null;
  const opt = SENSITIVITY_OPTIONS.find(s => s.code === code);
  if (!opt) return <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{code}</span>;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${opt.bg} ${opt.color}`}>{opt.label}</span>;
}

export function FulfillmentTab({ caseData, currentUser: _user, onChanged }: Props) {
  const currentIdx    = STAGES.findIndex(s => s.code === caseData.fulfillmentStageCode);
  const inFulfillment = caseData.statusCode === "IN_FULFILLMENT";
  const stage         = caseData.fulfillmentStageCode;

  // Stage advancement
  const [advancing, setAdvancing] = useState(false);
  const [advErr,    setAdvErr]    = useState<string | null>(null);

  // Delivery form
  const [delivRef, setDelivRef] = useState("");
  const [delivMsg, setDelivMsg] = useState("");

  // Source mapping data
  const [reqAttrs,    setReqAttrs]    = useState<ReqAttr[]>([]);
  const [mappings,    setMappings]    = useState<Mapping[]>([]);
  const [loadingMap,  setLoadingMap]  = useState(false);
  const [editingAttr, setEditingAttr] = useState<number | null>(null);

  // Catalog cascade
  const [sources,  setSources]  = useState<CatalogItem[]>([]);
  const [entities, setEntities] = useState<CatalogItem[]>([]);
  const [attrs,    setAttrs]    = useState<CatalogItem[]>([]);

  // Mapping form
  const [mapForm,   setMapForm]   = useState<MapForm>(emptyForm());
  // Classification detected from the selected catalog attribute
  const [catalogClassDetected, setCatalogClassDetected] = useState<{ code: string | null; label: string | null } | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [mapErr,    setMapErr]    = useState<string | null>(null);

  // Steward notification
  const [notifyingAttr, setNotifyingAttr] = useState<number | null>(null); // mappingId
  const [notifyMsg,     setNotifyMsg]     = useState("");
  const [sendingNotif,  setSendingNotif]  = useState(false);

  const [runningQC, setRunningQC] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadMappingData = useCallback(async () => {
    setLoadingMap(true);
    try {
      const [attrsRes, mapsRes] = await Promise.all([
        fetch(`/api/foi/${caseData.foiRequestId}/attributes`).then(r => r.ok ? r.json() : []),
        fetch(`/api/foi/${caseData.foiRequestId}/mappings`).then(r => r.ok ? r.json() : []),
      ]);
      setReqAttrs(attrsRes);
      setMappings(mapsRes);
    } finally { setLoadingMap(false); }
  }, [caseData.foiRequestId]);

  useEffect(() => {
    const s = stage ?? "";
    if (["SOURCE_MAPPING","CLASSIFICATION_GATE","QUALITY_GATE","TECHNICAL_COMPILATION"].includes(s)) {
      loadMappingData();
    }
  }, [stage, loadMappingData]);

  useEffect(() => {
    if (editingAttr !== null) {
      fetch("/api/foi/catalog-lookup?type=sources").then(r => r.json()).then(d => setSources(d ?? [])).catch(() => {});
    }
  }, [editingAttr]);

  async function loadEntities(sourceId: string) {
    if (!sourceId) { setEntities([]); setAttrs([]); return; }
    const data = await fetch(`/api/foi/catalog-lookup?type=entities&sourceId=${sourceId}`).then(r => r.json());
    setEntities(data ?? []); setAttrs([]);
    setMapForm(f => ({ ...f, dataEntityId: "", dataAttributeId: "" }));
    setCatalogClassDetected(null);
  }

  async function loadAttrs(entityId: string) {
    if (!entityId) { setAttrs([]); return; }
    const data = await fetch(`/api/foi/catalog-lookup?type=attributes&entityId=${entityId}`).then(r => r.json());
    setAttrs(data ?? []);
    setMapForm(f => ({ ...f, dataAttributeId: "" }));
    setCatalogClassDetected(null);
  }

  function onAttrSelected(attrId: string) {
    setMapForm(f => ({ ...f, dataAttributeId: attrId }));
    if (!attrId) { setCatalogClassDetected(null); return; }
    const found = attrs.find(a => String(a.id) === attrId);
    if (found) {
      const cls = { code: found.classificationCode ?? null, label: found.classificationLabel ?? null };
      setCatalogClassDetected(cls);
      // Auto-fill sensitivity from catalog if officer hasn't manually set it
      if (!mapForm.sensitivityCode && cls.code) {
        setMapForm(f => ({ ...f, sensitivityCode: cls.code! }));
      }
    }
  }

  // ── Mapping edit ──────────────────────────────────────────────────────────────

  function openEdit(reqAttrId: number) {
    const ex = mappings.find(m => m.reqAttrId === reqAttrId);
    if (ex) {
      setMapForm({
        sourceType:      ex.sourceType,
        dataSourceId:    String(ex.dataSourceId  ?? ""),
        dataEntityId:    String(ex.dataEntityId  ?? ""),
        dataAttributeId: String(ex.dataAttributeId ?? ""),
        manualSystemName: ex.manualSystemName ?? "",
        manualEntityName: ex.manualEntityName ?? "",
        manualColumnName: ex.manualColumnName ?? "",
        sensitivityCode:  ex.sensitivityCode ?? "",
        officerNotes:     ex.officerNotes ?? "",
      });
      setCatalogClassDetected(ex.catalogClassCode ? { code: ex.catalogClassCode, label: ex.catalogClassLabel ?? null } : null);
      if (ex.dataSourceId) {
        fetch(`/api/foi/catalog-lookup?type=entities&sourceId=${ex.dataSourceId}`).then(r => r.json()).then(d => setEntities(d ?? [])).catch(() => {});
      }
      if (ex.dataEntityId) {
        fetch(`/api/foi/catalog-lookup?type=attributes&entityId=${ex.dataEntityId}`).then(r => r.json()).then(d => setAttrs(d ?? [])).catch(() => {});
      }
    } else {
      setMapForm(emptyForm()); setEntities([]); setAttrs([]); setCatalogClassDetected(null);
    }
    setMapErr(null);
    setEditingAttr(reqAttrId);
  }

  async function saveMapping() {
    if (!editingAttr) return;
    setMapErr(null);
    if (mapForm.sourceType === "CATALOG" && !mapForm.dataAttributeId) { setMapErr("Select a column from the catalog"); return; }
    if (mapForm.sourceType === "MANUAL"  && !mapForm.manualColumnName.trim()) { setMapErr("Column / field name is required"); return; }
    // Allow saving without sensitivity only for unclassified catalog columns (gate enforces later)

    setSavingMap(true);
    try {
      const body: Record<string, unknown> = {
        reqAttrId:       editingAttr,
        sourceType:      mapForm.sourceType,
        sensitivityCode: mapForm.sensitivityCode || null,
        officerNotes:    mapForm.officerNotes || null,
      };
      if (mapForm.sourceType === "CATALOG") {
        body.dataSourceId    = mapForm.dataSourceId    ? Number(mapForm.dataSourceId)    : null;
        body.dataEntityId    = mapForm.dataEntityId    ? Number(mapForm.dataEntityId)    : null;
        body.dataAttributeId = Number(mapForm.dataAttributeId);
      } else {
        body.manualSystemName = mapForm.manualSystemName || null;
        body.manualEntityName = mapForm.manualEntityName || null;
        body.manualColumnName = mapForm.manualColumnName;
        if (!mapForm.sensitivityCode) { setMapErr("Sensitivity classification is required for manual mappings"); setSavingMap(false); return; }
      }

      const r = await fetch(`/api/foi/${caseData.foiRequestId}/mappings`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setMapErr(d.error ?? "Save failed");
        return;
      }
      setEditingAttr(null);
      await loadMappingData();
    } finally { setSavingMap(false); }
  }

  async function deleteMapping(mappingId: number) {
    await fetch(`/api/foi/${caseData.foiRequestId}/mappings?mappingId=${mappingId}`, { method: "DELETE" });
    await loadMappingData();
  }

  async function sendStewardNotification(mappingId: number) {
    setSendingNotif(true);
    try {
      await fetch(`/api/foi/${caseData.foiRequestId}/mappings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "NOTIFY_STEWARD", mappingId, message: notifyMsg || undefined }),
      });
      setNotifyingAttr(null); setNotifyMsg("");
      await loadMappingData();
    } finally { setSendingNotif(false); }
  }

  async function runQualityCheck() {
    setRunningQC(true);
    try {
      await fetch(`/api/foi/${caseData.foiRequestId}/mappings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RUN_QUALITY_CHECK" }),
      });
      await loadMappingData();
    } finally { setRunningQC(false); }
  }

  async function advance(extra: Record<string, unknown> = {}) {
    setAdvancing(true); setAdvErr(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADVANCE_STAGE", ...extra }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setAdvErr(d.error ?? "Failed"); return; }
      onChanged();
    } finally { setAdvancing(false); }
  }

  async function deliver() {
    if (!delivRef.trim()) { setAdvErr("Delivery reference is required"); return; }
    setAdvancing(true); setAdvErr(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELIVER", deliveryReference: delivRef.trim(), message: delivMsg || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setAdvErr(d.error ?? "Failed"); return; }
      onChanged();
    } finally { setAdvancing(false); }
  }

  // ── Gate checks ───────────────────────────────────────────────────────────────

  const allMapped       = reqAttrs.length > 0 && reqAttrs.every(a => mappings.some(m => m.reqAttrId === a.reqAttrId));
  const blockedMappings = mappings.filter(m => m.classificationStatus === "BLOCKED");
  const pendingMappings = mappings.filter(m => m.classificationStatus === "PENDING");
  const unclassifiedInCatalog = mappings.filter(m => m.sourceType === "CATALOG" && !m.catalogClassCode && !m.sensitivityCode);
  const qualityFlagged  = mappings.filter(m => m.qualityStatus === "FLAGGED");

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!stage && !inFulfillment) {
    return (
      <div className="card p-8 text-center text-muted text-sm max-w-2xl">
        Fulfillment starts after the requester accepts the quote and payment is confirmed (or exempted). Use the Assessment &amp; Quote tab to start fulfillment.
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">

      {/* Stage timeline */}
      <div className="card p-5">
        <h2 className="font-semibold text-sm text-ink mb-4">Fulfillment Stages</h2>
        <div className="space-y-1">
          {STAGES.map((s, i) => {
            const done    = i < currentIdx;
            const current = i === currentIdx;
            return (
              <div key={s.code} className="flex items-start gap-3 py-2">
                <div className="shrink-0 flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                    done    ? "bg-green-500 border-green-500 text-white" :
                    current ? "bg-brand-purple border-brand-purple text-white" :
                              "bg-white border-line text-muted"
                  }`}>{done ? "✓" : i + 1}</div>
                  {i < STAGES.length - 1 && <div className={`w-0.5 h-5 mt-0.5 ${done ? "bg-green-500" : "bg-line"}`} />}
                </div>
                <div className={`flex-1 pb-1 ${i > currentIdx ? "opacity-50" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-medium ${current ? "text-brand-purple" : done ? "text-green-700" : "text-ink-soft"}`}>{s.label}</span>
                    <span className="text-[10px] text-muted">{s.role}</span>
                    {current && <span className="text-[10px] bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded-full font-semibold">Current</span>}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">{s.desc}</p>
                  {current && caseData.linkedOpenDatasetId && s.code === "TECHNICAL_COMPILATION" && (
                    <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer"
                      className="text-[11px] text-brand-purple hover:underline mt-0.5 block">
                      → View linked Open Data dataset #{caseData.linkedOpenDatasetId}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SOURCE_MAPPING ── */}
      {inFulfillment && stage === "SOURCE_MAPPING" && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-ink">Source Mapping</h2>
            <span className="text-[11px] text-muted">{mappings.length} / {reqAttrs.length} mapped</span>
          </div>
          <p className="text-xs text-muted">
            Map each attribute to a source column. When mapped to a catalog column, the classification is read automatically.
            If a column is unclassified in the catalog, coordinate with the data steward before proceeding.
          </p>

          {loadingMap ? (
            <div className="py-6 text-center text-muted text-sm">Loading…</div>
          ) : reqAttrs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted italic">
              No structured attributes were submitted with this request.
            </div>
          ) : (
            <div className="space-y-3">
              {reqAttrs.map(a => {
                const mapping   = mappings.find(m => m.reqAttrId === a.reqAttrId);
                const isEditing = editingAttr === a.reqAttrId;
                const needsSteward = mapping?.sourceType === "CATALOG" && !mapping.catalogClassCode && !mapping.sensitivityCode;
                const isNotifying  = notifyingAttr === mapping?.mappingId;

                return (
                  <div key={a.reqAttrId} className="border border-line rounded-xl overflow-hidden">
                    {/* Attribute header */}
                    <div className={`px-4 py-3 flex items-start gap-3 ${isEditing ? "bg-brand-purple/5" : "bg-canvas-soft"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-ink">{a.name}</span>
                          {a.requestedFormatHint && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{a.requestedFormatHint}</span>}
                          {mapping ? (
                            <>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                mapping.classificationStatus === "CLEARED" ? "bg-green-100 text-green-700" :
                                mapping.classificationStatus === "BLOCKED" ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>{mapping.classificationStatus}</span>
                              <SensChip code={mapping.sensitivityCode} />
                              {mapping.catalogClassCode && (
                                <span className="text-[10px] text-blue-600 italic">catalog: {mapping.catalogClassLabel ?? mapping.catalogClassCode}</span>
                              )}
                              {needsSteward && !mapping.stewardNotifiedAt && (
                                <span className="text-[10px] text-orange-600 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">Unclassified in catalog</span>
                              )}
                              {mapping.stewardNotifiedAt && (
                                <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">Steward notified {new Date(mapping.stewardNotifiedAt).toLocaleDateString()}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">Not mapped</span>
                          )}
                        </div>
                        {a.description && <p className="text-[11px] text-muted mt-0.5">{a.description}</p>}
                        {mapping && (
                          <p className="text-[11px] text-muted mt-0.5">
                            {mapping.sourceType === "CATALOG"
                              ? `${mapping.dataSourceName ?? "—"} › ${mapping.dataEntityDisplayName ?? "—"} › ${mapping.dataAttributeDisplayName ?? mapping.dataAttributeName ?? "—"} (${mapping.dataType ?? "—"})`
                              : `Manual: ${[mapping.manualSystemName, mapping.manualEntityName, mapping.manualColumnName].filter(Boolean).join(" › ")}`
                            }
                          </p>
                        )}
                        {mapping?.classificationNotes && (
                          <p className="text-[11px] text-amber-700 mt-0.5 italic">{mapping.classificationNotes}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {!isEditing && (
                          <button onClick={() => openEdit(a.reqAttrId)} className="btn btn-sm text-[11px]">{mapping ? "Edit" : "+ Map"}</button>
                        )}
                        {mapping && !isEditing && needsSteward && !mapping.stewardNotifiedAt && (
                          <button onClick={() => { setNotifyingAttr(mapping.mappingId); setNotifyMsg(""); }} className="btn btn-sm text-[11px] border-teal-400 text-teal-700">Notify Steward</button>
                        )}
                        {mapping && !isEditing && (
                          <button onClick={() => deleteMapping(mapping.mappingId)} className="btn btn-sm text-[11px] text-red-500 border-red-200 hover:border-red-400">×</button>
                        )}
                      </div>
                    </div>

                    {/* Steward notification form */}
                    {isNotifying && mapping && (
                      <div className="px-4 py-3 border-t border-line bg-teal-50 space-y-2">
                        <p className="text-xs font-semibold text-teal-800">Notify data steward to classify this column</p>
                        <textarea className="input w-full text-sm h-16 resize-none"
                          placeholder="Optional message to the steward (a default message will be sent if left empty)…"
                          value={notifyMsg} onChange={e => setNotifyMsg(e.target.value)} />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setNotifyingAttr(null)} className="btn btn-sm text-[11px]">Cancel</button>
                          <button onClick={() => sendStewardNotification(mapping.mappingId)} disabled={sendingNotif} className="btn btn-primary btn-sm text-[11px]">
                            {sendingNotif ? "Sending…" : "Send Notification"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline mapping form */}
                    {isEditing && (
                      <div className="p-4 border-t border-line space-y-4">
                        <div className="flex gap-2">
                          {(["CATALOG","MANUAL"] as const).map(t => (
                            <button key={t} onClick={() => { setMapForm(f => ({ ...f, sourceType: t })); setCatalogClassDetected(null); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                mapForm.sourceType === t ? "bg-brand-purple text-white border-brand-purple" : "border-line text-muted hover:border-brand-purple/50"
                              }`}>
                              {t === "CATALOG" ? "From Catalog" : "Manual Entry"}
                            </button>
                          ))}
                        </div>

                        {mapForm.sourceType === "CATALOG" ? (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase mb-1">Source System</label>
                                <select className="input w-full text-sm" value={mapForm.dataSourceId}
                                  onChange={e => { setMapForm(f => ({ ...f, dataSourceId: e.target.value })); loadEntities(e.target.value); }}>
                                  <option value="">— Select —</option>
                                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase mb-1">Table / Entity</label>
                                <select className="input w-full text-sm" value={mapForm.dataEntityId} disabled={!entities.length}
                                  onChange={e => { setMapForm(f => ({ ...f, dataEntityId: e.target.value })); loadAttrs(e.target.value); }}>
                                  <option value="">— Select —</option>
                                  {entities.map(e => <option key={e.id} value={e.id}>{e.displayName ?? e.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase mb-1">Column / Attribute <span className="text-red-500">*</span></label>
                                <select className="input w-full text-sm" value={mapForm.dataAttributeId} disabled={!attrs.length}
                                  onChange={e => onAttrSelected(e.target.value)}>
                                  <option value="">— Select —</option>
                                  {attrs.map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.displayName ?? a.name}{a.dataType ? ` (${a.dataType})` : ""}{a.classificationCode ? ` [${a.classificationCode}]` : " [unclassified]"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Catalog classification feedback */}
                            {mapForm.dataAttributeId && catalogClassDetected !== null && (
                              catalogClassDetected.code ? (
                                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                  <span className="text-xs text-blue-700">Classification read from catalog:</span>
                                  <SensChip code={catalogClassDetected.code} />
                                  <span className="text-xs text-blue-600">(auto-filled below)</span>
                                </div>
                              ) : (
                                <div className="px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                                  <p className="text-xs font-semibold text-orange-800">⚠ Column is not classified in the data catalog</p>
                                  <p className="text-xs text-orange-700 mt-0.5">Save this mapping first, then use <strong>Notify Steward</strong> to ask the responsible steward to classify this column before proceeding to the Classification Gate.</p>
                                </div>
                              )
                            )}
                          </>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-muted uppercase mb-1">System / Application</label>
                              <input className="input w-full text-sm" placeholder="e.g. SAP, Oracle HR" value={mapForm.manualSystemName}
                                onChange={e => setMapForm(f => ({ ...f, manualSystemName: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-muted uppercase mb-1">Table / Report</label>
                              <input className="input w-full text-sm" placeholder="e.g. PA0001" value={mapForm.manualEntityName}
                                onChange={e => setMapForm(f => ({ ...f, manualEntityName: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-muted uppercase mb-1">Column / Field <span className="text-red-500">*</span></label>
                              <input className="input w-full text-sm" placeholder="e.g. EMPLOYEE_COUNT" value={mapForm.manualColumnName}
                                onChange={e => setMapForm(f => ({ ...f, manualColumnName: e.target.value }))} />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-muted uppercase mb-1">
                              Sensitivity Classification
                              {mapForm.sourceType === "MANUAL" && <span className="text-red-500"> *</span>}
                              {mapForm.sourceType === "CATALOG" && <span className="text-muted font-normal"> (auto-filled from catalog)</span>}
                            </label>
                            <select className="input w-full text-sm" value={mapForm.sensitivityCode}
                              onChange={e => setMapForm(f => ({ ...f, sensitivityCode: e.target.value }))}>
                              <option value="">{mapForm.sourceType === "CATALOG" && !catalogClassDetected?.code ? "— Pending steward classification —" : "— Select —"}</option>
                              {SENSITIVITY_OPTIONS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                            </select>
                            {mapForm.sensitivityCode && BLOCKED_SENSITIVITIES.has(mapForm.sensitivityCode) && (
                              <p className="text-[10px] text-red-600 mt-1">⚠ This will block the request. Use Public or Internal to allow disclosure.</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-muted uppercase mb-1">Officer Notes</label>
                            <input className="input w-full text-sm" placeholder="Caveats, conditions, context…" value={mapForm.officerNotes}
                              onChange={e => setMapForm(f => ({ ...f, officerNotes: e.target.value }))} />
                          </div>
                        </div>

                        {mapErr && <p className="text-sm text-red-600">{mapErr}</p>}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setEditingAttr(null); setCatalogClassDetected(null); }} className="btn btn-sm">Cancel</button>
                          <button onClick={saveMapping} disabled={savingMap} className="btn btn-primary btn-sm">
                            {savingMap ? "Saving…" : "Save Mapping"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unclassified warning summary */}
          {unclassifiedInCatalog.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-orange-800">
                {unclassifiedInCatalog.length} column(s) are not classified in the catalog — notify the responsible steward to complete classification before advancing.
              </p>
            </div>
          )}

          {advErr && <p className="text-sm text-red-600">{advErr}</p>}
          {!allMapped && reqAttrs.length > 0 && (
            <p className="text-xs text-amber-700">Map all {reqAttrs.length} attributes before proceeding.</p>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={() => advance()} disabled={advancing || !allMapped} className="btn btn-primary btn-sm">
              {advancing ? "…" : "Run Classification Check →"}
            </button>
          </div>
        </div>
      )}

      {/* ── CLASSIFICATION_GATE ── */}
      {inFulfillment && stage === "CLASSIFICATION_GATE" && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-ink">Classification Gate</h2>
          {loadingMap ? <div className="py-4 text-center text-muted text-sm">Loading…</div> : (
            <>
              {blockedMappings.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-red-800">⛔ {blockedMappings.length} column(s) blocked</p>
                  {blockedMappings.map(m => (
                    <div key={m.mappingId} className="text-xs text-red-700">
                      • <strong>{m.requestedAttributeName}</strong>: <SensChip code={m.sensitivityCode} />
                      {m.catalogClassCode && <span className="ml-1 text-red-600 italic">(catalog: {m.catalogClassLabel ?? m.catalogClassCode})</span>}
                    </div>
                  ))}
                  <p className="text-xs text-red-600 mt-2">Return to Source Mapping and replace with PUBLIC or INTERNAL columns, or reject the request on classification grounds.</p>
                </div>
              )}
              {pendingMappings.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-sm text-amber-800">{pendingMappings.length} mapping(s) still pending classification — return to Source Mapping.</p>
                  {pendingMappings.map(m => (
                    <div key={m.mappingId} className="text-xs text-amber-700 mt-1">
                      • <strong>{m.requestedAttributeName}</strong>
                      {m.stewardNotifiedAt ? ` — steward notified ${new Date(m.stewardNotifiedAt).toLocaleDateString()}` : " — steward not yet notified"}
                    </div>
                  ))}
                </div>
              )}
              {blockedMappings.length === 0 && pendingMappings.length === 0 && mappings.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-semibold text-green-800">✓ All {mappings.length} columns cleared</p>
                  {mappings.map(m => (
                    <div key={m.mappingId} className="text-xs text-green-700 flex items-center gap-2">
                      • <strong>{m.requestedAttributeName}</strong> — <SensChip code={m.sensitivityCode} />
                      {m.catalogClassCode && <span className="italic text-green-600">catalog: {m.catalogClassLabel ?? m.catalogClassCode}</span>}
                    </div>
                  ))}
                </div>
              )}
              {advErr && <p className="text-sm text-red-600">{advErr}</p>}
              <div className="flex justify-end pt-1">
                <button onClick={() => advance()} disabled={advancing || blockedMappings.length > 0 || pendingMappings.length > 0} className="btn btn-primary btn-sm">
                  {advancing ? "…" : "Proceed to Quality Gate →"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── QUALITY_GATE ── */}
      {inFulfillment && stage === "QUALITY_GATE" && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-ink">Quality Gate</h2>
            <button onClick={runQualityCheck} disabled={runningQC} className="btn btn-sm text-xs">
              {runningQC ? "Running…" : "▶ Run DQ Check"}
            </button>
          </div>
          {loadingMap || runningQC ? <div className="py-4 text-center text-muted text-sm">Loading…</div> : (
            <>
              <div className="space-y-2">
                {mappings.map(m => (
                  <div key={m.mappingId} className={`px-4 py-3 rounded-xl border ${
                    m.qualityStatus === "CLEARED" ? "border-green-200 bg-green-50" :
                    m.qualityStatus === "FLAGGED" ? "border-amber-200 bg-amber-50" : "border-line bg-canvas-soft"
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-ink">{m.requestedAttributeName}</span>
                        <span className="text-[10px] text-muted ml-2">
                          {m.sourceType === "CATALOG"
                            ? `${m.dataEntityDisplayName ?? ""} › ${m.dataAttributeDisplayName ?? m.dataAttributeName ?? ""}`
                            : `Manual: ${m.manualColumnName ?? ""}`}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        m.qualityStatus === "CLEARED" ? "bg-green-100 text-green-700" :
                        m.qualityStatus === "FLAGGED" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                      }`}>{m.qualityStatus}</span>
                    </div>
                    {m.qualityNotes && <p className="text-[11px] text-muted mt-1">{m.qualityNotes}</p>}
                  </div>
                ))}
              </div>
              {qualityFlagged.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs text-amber-800"><strong>{qualityFlagged.length} column(s) flagged</strong> with DQ issues. Document in officer notes before advancing.</p>
                </div>
              )}
              {advErr && <p className="text-sm text-red-600">{advErr}</p>}
              <div className="flex justify-end pt-1">
                <button onClick={() => advance()} disabled={advancing} className="btn btn-primary btn-sm">
                  {advancing ? "…" : "Proceed → Create Open Data Dataset"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TECHNICAL_COMPILATION and later ── */}
      {inFulfillment && stage !== "SOURCE_MAPPING" && stage !== "CLASSIFICATION_GATE" && stage !== "QUALITY_GATE" && stage !== "DELIVERY" && (
        <div className="card p-5 space-y-3">
          {stage === "TECHNICAL_COMPILATION" && caseData.linkedOpenDatasetId && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              Open Data dataset{" "}
              <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="underline font-semibold">
                #{caseData.linkedOpenDatasetId}
              </a>{" "}
              auto-created from this request&apos;s catalog mappings. Publish it after compilation.
            </div>
          )}
          {advErr && <p className="text-sm text-red-600">{advErr}</p>}
          <div className="flex justify-end">
            <button onClick={() => advance()} disabled={advancing} className="btn btn-primary btn-sm">
              {advancing ? "…" : "Mark Stage Complete → Advance"}
            </button>
          </div>
        </div>
      )}

      {/* ── DELIVERY ── */}
      {inFulfillment && stage === "DELIVERY" && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-ink">Deliver to Requester</h2>
          {caseData.linkedOpenDatasetId && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              Linked dataset:{" "}
              <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="underline font-medium">
                #{caseData.linkedOpenDatasetId}
              </a>{" "}— ensure it is published before delivery.
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Delivery Reference / Link <span className="text-red-500">*</span></label>
            <input className="input w-full" placeholder="Secure file share URL, dataset portal link, email reference…" value={delivRef} onChange={e => setDelivRef(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Message to Requester</label>
            <textarea className="input w-full h-20 resize-none" placeholder="Delivery note sent to the requester…" value={delivMsg} onChange={e => setDelivMsg(e.target.value)} />
          </div>
          {advErr && <p className="text-sm text-red-600">{advErr}</p>}
          <div className="flex justify-end">
            <button onClick={deliver} disabled={advancing} className="btn btn-primary btn-sm">
              {advancing ? "…" : "✓ Confirm Delivery & Close Case"}
            </button>
          </div>
        </div>
      )}

      {/* ── DELIVERED ── */}
      {caseData.statusCode === "DELIVERED" && (
        <div className="card p-5 bg-green-50 border border-green-200 space-y-2">
          <h2 className="font-semibold text-sm text-green-800">✓ Case Delivered & Closed</h2>
          <p className="text-xs text-green-700">Delivery reference: <span className="font-mono">{caseData.deliveryReference}</span></p>
          {caseData.linkedOpenDatasetId && (
            <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="text-xs text-brand-purple hover:underline block">
              → View Open Data dataset #{caseData.linkedOpenDatasetId}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
