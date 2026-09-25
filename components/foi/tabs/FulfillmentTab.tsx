"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoiCaseDetail } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";

type Props = { caseData: FoiCaseDetail; currentUser: SessionUser; onChanged: () => void };

type FulfillmentStrings = I18nStrings["foi"]["fulfillment"];

function buildStages(c: FulfillmentStrings) {
  return [
    { code: "OWNER_IDENTIFICATION",   label: c.stage.ownerIdName,      role: c.stage.ownerIdRole,      desc: c.stage.ownerIdDesc },
    { code: "SOURCE_MAPPING",         label: c.stage.sourceMapName,    role: c.stage.sourceMapRole,    desc: c.stage.sourceMapDesc },
    { code: "CLASSIFICATION_GATE",    label: c.stage.classGateName,    role: c.stage.classGateRole,    desc: c.stage.classGateDesc },
    { code: "QUALITY_GATE",           label: c.stage.qualityGateName,  role: c.stage.qualityGateRole,  desc: c.stage.qualityGateDesc },
    { code: "TECHNICAL_COMPILATION",  label: c.stage.techCompName,     role: c.stage.techCompRole,     desc: c.stage.techCompDesc },
    { code: "OWNER_PACKAGE_APPROVAL", label: c.stage.ownerApprovalName,role: c.stage.ownerApprovalRole,desc: c.stage.ownerApprovalDesc },
    { code: "DMO_RELEASE_APPROVAL",   label: c.stage.dmoApprovalName,  role: c.stage.dmoApprovalRole,  desc: c.stage.dmoApprovalDesc },
    { code: "DELIVERY",               label: c.stage.deliveryName,     role: c.stage.deliveryRole,     desc: c.stage.deliveryDesc },
  ];
}

function buildSensitivityOptions(c: FulfillmentStrings) {
  return [
    { code: "PUBLIC",       label: c.sensPublic,       color: "text-green-700",  bg: "bg-green-100" },
    { code: "INTERNAL",     label: c.sensInternal,     color: "text-blue-700",   bg: "bg-blue-100" },
    { code: "CONFIDENTIAL", label: c.sensConfidential, color: "text-orange-700", bg: "bg-orange-100" },
    { code: "RESTRICTED",   label: c.sensRestricted,   color: "text-red-700",    bg: "bg-red-100" },
    { code: "SECRET",       label: c.sensSecret,       color: "text-red-900",    bg: "bg-red-200" },
    { code: "TOP_SECRET",   label: c.sensTopSecret,    color: "text-red-900",    bg: "bg-red-300" },
  ];
}

const BLOCKED_SENSITIVITIES = new Set(["CONFIDENTIAL","RESTRICTED","SECRET","TOP_SECRET"]);
const OPEN_DATA_PROCESSED_STATUSES = new Set(["PENDING_APPROVAL","APPROVED","PUBLISHED"]);

type ReqAttr = {
  reqAttrId: number;
  name: string;
  description: string | null;
  requestedFormatHint: string | null;
};

type CollabNote = {
  commId: number;
  mappingId: number;
  body: string;
  sentAt: string;
  direction: string;
  senderName: string;
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
  collaborationThread: CollabNote[];
  // Live DQ data (from dq_rules / dq_results, populated in GET)
  dqRulesCount: number;
  dqLatestStatus: string | null;
  dqLatestFailPct: number | null;
  dqLatestRunAt: string | null;
};

type CatalogItem = {
  id: number;
  name: string;
  displayName?: string;
  dataType?: string;
  classificationCode?: string | null;
  classificationLabel?: string | null;
  classificationMapped?: boolean;
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

function SensChip({ code, opts }: { code: string | null; opts: ReturnType<typeof buildSensitivityOptions> }) {
  if (!code) return null;
  const opt = opts.find(s => s.code === code);
  if (!opt) return <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{code}</span>;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${opt.bg} ${opt.color}`}>{opt.label}</span>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export function FulfillmentTab({ caseData, currentUser: _user, onChanged }: Props) {
  const { t } = useLang();
  const c = t.foi.fulfillment;
  const STAGES = buildStages(c);
  const SENSITIVITY_OPTIONS = buildSensitivityOptions(c);
  const currentIdx    = STAGES.findIndex(s => s.code === caseData.fulfillmentStageCode);
  const inFulfillment = caseData.statusCode === "IN_FULFILLMENT";
  const stage         = caseData.fulfillmentStageCode;

  const [advancing, setAdvancing] = useState(false);
  const [advErr,    setAdvErr]    = useState<string | null>(null);

  const [delivRef, setDelivRef] = useState("");
  const [delivMsg, setDelivMsg] = useState("");

  const [reqAttrs,    setReqAttrs]    = useState<ReqAttr[]>([]);
  const [mappings,    setMappings]    = useState<Mapping[]>([]);
  const [loadingMap,  setLoadingMap]  = useState(false);
  const [editingAttr, setEditingAttr] = useState<number | null>(null);

  const [sources,  setSources]  = useState<CatalogItem[]>([]);
  const [entities, setEntities] = useState<CatalogItem[]>([]);
  const [attrs,    setAttrs]    = useState<CatalogItem[]>([]);

  const [mapForm,   setMapForm]   = useState<MapForm>(emptyForm());
  const [catalogClassDetected, setCatalogClassDetected] = useState<{
    code: string | null; label: string | null; mapped: boolean;
  } | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [mapErr,    setMapErr]    = useState<string | null>(null);

  // Per-mapping collaboration thread state
  const [threadNotes, setThreadNotes] = useState<Record<number, string>>({});
  const [sendingNote, setSendingNote] = useState<number | null>(null);
  // Per-mapping "Mark as Classified" form
  const [markClassifyId, setMarkClassifyId] = useState<number | null>(null);
  const [markSensCode,   setMarkSensCode]   = useState("");
  const [markNotes,      setMarkNotes]      = useState("");
  const [markSaving,     setMarkSaving]     = useState(false);
  // Which mapping threads are expanded
  const [expandedThread, setExpandedThread] = useState<Set<number>>(new Set());

  const [runningQC, setRunningQC] = useState(false);

  // Delivery type choice (QUALITY_GATE → TECHNICAL_COMPILATION)
  const [deliveryType,    setDeliveryType]    = useState<"OPEN_DATA"|"ONE_OFF"|"">(
    (caseData.foiDeliveryType as "OPEN_DATA"|"ONE_OFF") ?? ""
  );
  const [datasetName,     setDatasetName]     = useState("");
  const [datasetDesc,     setDatasetDesc]     = useState("");

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
      const cls = {
        code:   found.classificationCode ?? null,
        label:  found.classificationLabel ?? null,
        mapped: found.classificationMapped ?? false,
      };
      setCatalogClassDetected(cls);
      // Only auto-fill sensitivity when the catalog code maps 1:1 to a FOI sensitivity code
      if (!mapForm.sensitivityCode && cls.code && cls.mapped) {
        setMapForm(f => ({ ...f, sensitivityCode: cls.code! }));
      }
    }
  }

  function openEdit(reqAttrId: number) {
    const ex = mappings.find(m => m.reqAttrId === reqAttrId);
    if (ex) {
      setMapForm({
        sourceType:       ex.sourceType,
        dataSourceId:     String(ex.dataSourceId  ?? ""),
        dataEntityId:     String(ex.dataEntityId  ?? ""),
        dataAttributeId:  String(ex.dataAttributeId ?? ""),
        manualSystemName: ex.manualSystemName ?? "",
        manualEntityName: ex.manualEntityName ?? "",
        manualColumnName: ex.manualColumnName ?? "",
        sensitivityCode:  ex.sensitivityCode ?? "",
        officerNotes:     ex.officerNotes ?? "",
      });
      setCatalogClassDetected(ex.catalogClassCode ? { code: ex.catalogClassCode, label: ex.catalogClassLabel ?? null, mapped: false } : null);
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
    if (mapForm.sourceType === "MANUAL"  && !mapForm.sensitivityCode) { setMapErr("Sensitivity classification is required for manual mappings"); return; }

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

  async function sendCollabNote(mappingId: number) {
    const note = (threadNotes[mappingId] ?? "").trim();
    if (!note) return;
    setSendingNote(mappingId);
    try {
      await fetch(`/api/foi/${caseData.foiRequestId}/mappings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADD_COLLABORATION_NOTE", mappingId, note }),
      });
      setThreadNotes(n => ({ ...n, [mappingId]: "" }));
      setExpandedThread(s => new Set([...s, mappingId]));
      await loadMappingData();
    } finally { setSendingNote(null); }
  }

  async function markClassified() {
    if (!markClassifyId || !markSensCode) return;
    setMarkSaving(true);
    try {
      await fetch(`/api/foi/${caseData.foiRequestId}/mappings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_CLASSIFIED", mappingId: markClassifyId, sensitivityCode: markSensCode, notes: markNotes }),
      });
      setMarkClassifyId(null); setMarkSensCode(""); setMarkNotes("");
      await loadMappingData();
    } finally { setMarkSaving(false); }
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

  const allMapped       = reqAttrs.length > 0 && reqAttrs.every(a => mappings.some(m => m.reqAttrId === a.reqAttrId));
  const blockedMappings = mappings.filter(m => m.classificationStatus === "BLOCKED");
  const pendingMappings = mappings.filter(m => m.classificationStatus === "PENDING");
  const qualityFlagged  = mappings.filter(m => m.qualityStatus === "FLAGGED");

  if (!stage && !inFulfillment) {
    return (
      <div className="card p-8 text-center text-muted text-sm max-w-2xl">
        {c.notStartedYet}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">

      {/* Stage timeline */}
      <div className="card p-5">
        <h2 className="font-semibold text-sm text-ink mb-4">{c.stagesTitle}</h2>
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
                    {current && <span className="text-[10px] bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded-full font-semibold">{c.currentBadge}</span>}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">{s.desc}</p>
                  {current && caseData.linkedOpenDatasetId && s.code === "TECHNICAL_COMPILATION" && (
                    <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer"
                      className="text-[11px] text-brand-purple hover:underline mt-0.5 block">
                      {c.viewLinkedDataset.replace("{id}", String(caseData.linkedOpenDatasetId))}
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
            <h2 className="font-semibold text-sm text-ink">{c.sourceMappingTitle}</h2>
            <span className="text-[11px] text-muted">{c.mappedCount.replace("{mapped}", String(mappings.length)).replace("{total}", String(reqAttrs.length))}</span>
          </div>
          <p className="text-xs text-muted">
            {c.sourceMappingDesc}
          </p>

          {loadingMap ? (
            <div className="py-6 text-center text-muted text-sm">{t.common.loading}</div>
          ) : reqAttrs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted italic">{c.noStructuredAttrs}</div>
          ) : (
            <div className="space-y-3">
              {reqAttrs.map(a => {
                const mapping   = mappings.find(m => m.reqAttrId === a.reqAttrId);
                const isEditing = editingAttr === a.reqAttrId;
                // Column is unclassified if catalog-mapped but no catalog code AND no sensitivity set
                const needsClassification = mapping?.sourceType === "CATALOG" && !mapping.sensitivityCode;
                // Non-standard catalog code (PII, SENSITIVE) also needs officer to set FOI sensitivity
                const hasNonstandardCode  = mapping?.catalogClassCode && !mapping.sensitivityCode;
                const showThread = mapping && (needsClassification || hasNonstandardCode || (mapping.collaborationThread?.length ?? 0) > 0);
                const thread     = mapping?.collaborationThread ?? [];
                const isThreadExpanded = expandedThread.has(mapping?.mappingId ?? -1);

                return (
                  <div key={a.reqAttrId} className="border border-line rounded-xl overflow-hidden">
                    {/* Attribute header row */}
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
                              {mapping.sensitivityCode && <SensChip code={mapping.sensitivityCode} opts={SENSITIVITY_OPTIONS} />}
                              {mapping.catalogClassCode && (
                                <span className="text-[10px] italic text-blue-600">
                                  {c.catalogPrefix.replace("{label}", mapping.catalogClassLabel ?? mapping.catalogClassCode)}
                                </span>
                              )}
                              {needsClassification && !mapping.catalogClassCode && (
                                <span className="text-[10px] bg-orange-50 text-orange-700 font-semibold px-1.5 py-0.5 rounded">
                                  {c.unclassifiedInCatalog}
                                </span>
                              )}
                              {hasNonstandardCode && (
                                <span className="text-[10px] bg-purple-50 text-purple-700 font-semibold px-1.5 py-0.5 rounded">
                                  {c.needsFoiSensitivity}
                                </span>
                              )}
                              {mapping.stewardNotifiedAt && (
                                <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">
                                  {c.stewardNotified.replace("{date}", new Date(mapping.stewardNotifiedAt).toLocaleDateString())}
                                </span>
                              )}
                              {thread.length > 0 && (
                                <button onClick={() => setExpandedThread(s => { const n = new Set(s); if (n.has(mapping.mappingId)) n.delete(mapping.mappingId); else n.add(mapping.mappingId); return n; })}
                                  className="text-[10px] text-brand-purple hover:underline ml-1">
                                  {isThreadExpanded ? c.hideThread : c.threadCount.replace("{n}", String(thread.length))}
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">{c.notMapped}</span>
                          )}
                        </div>
                        {a.description && <p className="text-[11px] text-muted mt-0.5">{a.description}</p>}
                        {mapping && (
                          <p className="text-[11px] text-muted mt-0.5">
                            {mapping.sourceType === "CATALOG"
                              ? `${mapping.dataSourceName ?? "—"} › ${mapping.dataEntityDisplayName ?? "—"} › ${mapping.dataAttributeDisplayName ?? mapping.dataAttributeName ?? "—"} (${mapping.dataType ?? "—"})`
                              : c.manualPrefix.replace("{parts}", [mapping.manualSystemName, mapping.manualEntityName, mapping.manualColumnName].filter(Boolean).join(" › "))
                            }
                          </p>
                        )}
                        {mapping?.classificationNotes && (
                          <p className="text-[11px] text-amber-700 mt-0.5 italic">{mapping.classificationNotes}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {!isEditing && (
                          <button onClick={() => openEdit(a.reqAttrId)} className="btn btn-sm text-[11px]">{mapping ? t.common.edit : c.mapBtn}</button>
                        )}
                        {mapping && !isEditing && (
                          <button onClick={() => deleteMapping(mapping.mappingId)} className="btn btn-sm text-[11px] text-red-500 border-red-200 hover:border-red-400">×</button>
                        )}
                      </div>
                    </div>

                    {/* ── Collaboration thread ── (shown for unclassified or when notes exist) */}
                    {showThread && !isEditing && (
                      <div className="border-t border-line">
                        {/* Thread header */}
                        <div className="px-4 py-2 bg-teal-50 flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-semibold text-teal-800">
                              {caseData.referenceCode} | {mapping!.dataAttributeDisplayName ?? mapping!.dataAttributeName ?? mapping!.manualColumnName ?? "Column"}
                            </span>
                            <span className="text-[10px] text-teal-600 ml-2">
                              {c.classificationDiscussion.replace("{count}", thread.length > 0 ? ` (${thread.length})` : "")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {!mapping!.sensitivityCode && (
                              <button onClick={() => { setMarkClassifyId(mapping!.mappingId); setMarkSensCode(""); setMarkNotes(""); }}
                                className="text-[10px] font-semibold text-white bg-teal-600 hover:bg-teal-700 px-2 py-0.5 rounded transition-colors">
                                {c.markAsClassified}
                              </button>
                            )}
                            {thread.length > 0 && (
                              <button onClick={() => setExpandedThread(s => { const n = new Set(s); if (n.has(mapping!.mappingId)) n.delete(mapping!.mappingId); else n.add(mapping!.mappingId); return n; })}
                                className="text-[10px] text-teal-700 hover:underline">
                                {isThreadExpanded ? c.collapse : c.expand}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Message history */}
                        {(isThreadExpanded || thread.length === 0) && thread.length > 0 && (
                          <div className="px-4 py-2 space-y-2 bg-white max-h-48 overflow-y-auto">
                            {thread.map(note => (
                              <div key={note.commId} className="flex gap-2">
                                <div className="shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[9px] font-bold">
                                  {note.senderName.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-[11px] font-semibold text-ink">{note.senderName}</span>
                                    <span className="text-[10px] text-muted">{fmtDate(note.sentAt)}</span>
                                  </div>
                                  <p className="text-xs text-ink-soft whitespace-pre-wrap">{note.body}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Mark as Classified inline form */}
                        {markClassifyId === mapping!.mappingId && (
                          <div className="px-4 py-3 bg-teal-50/60 border-t border-teal-100 space-y-2">
                            <p className="text-xs font-semibold text-teal-800">
                              {c.setSensitivityTitle.replace("{column}", mapping!.dataAttributeDisplayName ?? mapping!.dataAttributeName ?? mapping!.manualColumnName ?? "column")}
                            </p>
                            <p className="text-[11px] text-teal-700">
                              {mapping!.catalogClassCode
                                ? c.catalogCodeHint.replace("{code}", mapping!.catalogClassCode)
                                : c.selectStewardConfirmedHint}
                            </p>
                            <div className="flex gap-2 items-end">
                              <div className="flex-1">
                                <select className="input w-full text-sm" value={markSensCode} onChange={e => setMarkSensCode(e.target.value)}>
                                  <option value="">{c.selectSensitivityPlaceholder}</option>
                                  {SENSITIVITY_OPTIONS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                                </select>
                              </div>
                              <div className="flex-1">
                                <input className="input w-full text-sm" placeholder={c.notesOptionalPlaceholder} value={markNotes} onChange={e => setMarkNotes(e.target.value)} />
                              </div>
                            </div>
                            {markSensCode && BLOCKED_SENSITIVITIES.has(markSensCode) && (
                              <p className="text-[10px] text-red-600">{c.blockAtGateWarning}</p>
                            )}
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setMarkClassifyId(null)} className="btn btn-sm text-[11px]">{t.common.cancel}</button>
                              <button onClick={markClassified} disabled={!markSensCode || markSaving} className="btn btn-primary btn-sm text-[11px]">
                                {markSaving ? t.common.saving : c.confirmClassification}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Add note input */}
                        {markClassifyId !== mapping!.mappingId && (
                          <div className="px-4 py-3 border-t border-teal-100 bg-white">
                            <div className="flex gap-2">
                              <textarea
                                className="input flex-1 text-sm h-10 resize-none"
                                placeholder={c.addNotePlaceholder}
                                value={threadNotes[mapping!.mappingId] ?? ""}
                                onChange={e => setThreadNotes(n => ({ ...n, [mapping!.mappingId]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendCollabNote(mapping!.mappingId); }}
                              />
                              <button
                                onClick={() => sendCollabNote(mapping!.mappingId)}
                                disabled={sendingNote === mapping!.mappingId || !(threadNotes[mapping!.mappingId] ?? "").trim()}
                                className="btn btn-sm text-[11px] self-end">
                                {sendingNote === mapping!.mappingId ? "…" : c.send}
                              </button>
                            </div>
                            <p className="text-[10px] text-muted mt-1">{c.cmdEnterHint}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline mapping form */}
                    {isEditing && (
                      <div className="p-4 border-t border-line space-y-4">
                        <div className="flex gap-2">
                          {(["CATALOG","MANUAL"] as const).map(st => (
                            <button key={st} onClick={() => { setMapForm(f => ({ ...f, sourceType: st })); setCatalogClassDetected(null); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                mapForm.sourceType === st ? "bg-brand-purple text-white border-brand-purple" : "border-line text-muted hover:border-brand-purple/50"
                              }`}>
                              {st === "CATALOG" ? c.fromCatalog : c.manualEntry}
                            </button>
                          ))}
                        </div>

                        {mapForm.sourceType === "CATALOG" ? (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.sourceSystemLabel}</label>
                                <select className="input w-full text-sm" value={mapForm.dataSourceId}
                                  onChange={e => { setMapForm(f => ({ ...f, dataSourceId: e.target.value })); loadEntities(e.target.value); }}>
                                  <option value="">{c.selectPlaceholder}</option>
                                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.tableEntityLabel}</label>
                                <select className="input w-full text-sm" value={mapForm.dataEntityId} disabled={!entities.length}
                                  onChange={e => { setMapForm(f => ({ ...f, dataEntityId: e.target.value })); loadAttrs(e.target.value); }}>
                                  <option value="">{c.selectPlaceholder}</option>
                                  {entities.map(e => <option key={e.id} value={e.id}>{e.displayName ?? e.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.columnAttributeLabel} <span className="text-red-500">*</span></label>
                                <select className="input w-full text-sm" value={mapForm.dataAttributeId} disabled={!attrs.length}
                                  onChange={e => onAttrSelected(e.target.value)}>
                                  <option value="">{c.selectPlaceholder}</option>
                                  {attrs.map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.displayName ?? a.name}{a.dataType ? ` (${a.dataType})` : ""}
                                      {a.classificationCode ? ` [${a.classificationCode}]` : ` [${c.unclassifiedOption}]`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Catalog classification feedback */}
                            {mapForm.dataAttributeId && catalogClassDetected !== null && (
                              catalogClassDetected.code ? (
                                catalogClassDetected.mapped ? (
                                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                    <span className="text-xs text-blue-700">{c.classFromCatalog}</span>
                                    <SensChip code={catalogClassDetected.code} opts={SENSITIVITY_OPTIONS} />
                                    <span className="text-xs text-blue-600">{c.autoFilledBelow}</span>
                                  </div>
                                ) : (
                                  <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                                    <p className="text-xs font-semibold text-purple-800">
                                      {c.catalogCodePrefix.replace("{code}", catalogClassDetected.code)}
                                    </p>
                                    <p className="text-xs text-purple-700 mt-0.5">
                                      {c.catalogCodeNonStandardDesc.replace("{code}", catalogClassDetected.code)}
                                    </p>
                                  </div>
                                )
                              ) : (
                                <div className="px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                                  <p className="text-xs font-semibold text-orange-800">{c.notClassifiedWarning}</p>
                                  <p className="text-xs text-orange-700 mt-0.5">
                                    {c.notClassifiedDesc}
                                  </p>
                                </div>
                              )
                            )}
                          </>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.systemAppLabel}</label>
                              <input className="input w-full text-sm" placeholder="e.g. SAP, Oracle HR" value={mapForm.manualSystemName}
                                onChange={e => setMapForm(f => ({ ...f, manualSystemName: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.tableReportLabel}</label>
                              <input className="input w-full text-sm" placeholder="e.g. PA0001" value={mapForm.manualEntityName}
                                onChange={e => setMapForm(f => ({ ...f, manualEntityName: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.columnFieldLabel} <span className="text-red-500">*</span></label>
                              <input className="input w-full text-sm" placeholder="e.g. EMPLOYEE_COUNT" value={mapForm.manualColumnName}
                                onChange={e => setMapForm(f => ({ ...f, manualColumnName: e.target.value }))} />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-muted uppercase mb-1">
                              {c.sensitivityLabel}
                              {mapForm.sourceType === "MANUAL" && <span className="text-red-500"> *</span>}
                              {mapForm.sourceType === "CATALOG" && <span className="text-muted font-normal"> {c.autoFilledOrThread}</span>}
                            </label>
                            <select className="input w-full text-sm" value={mapForm.sensitivityCode}
                              onChange={e => setMapForm(f => ({ ...f, sensitivityCode: e.target.value }))}>
                              <option value="">
                                {mapForm.sourceType === "CATALOG" && (!catalogClassDetected?.code || !catalogClassDetected?.mapped)
                                  ? c.pendingClassification : c.selectPlaceholder}
                              </option>
                              {SENSITIVITY_OPTIONS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                            </select>
                            {mapForm.sensitivityCode && BLOCKED_SENSITIVITIES.has(mapForm.sensitivityCode) && (
                              <p className="text-[10px] text-red-600 mt-1">{c.blockDisclosureWarning}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-muted uppercase mb-1">{c.officerNotesLabel}</label>
                            <input className="input w-full text-sm" placeholder={c.officerNotesPlaceholder} value={mapForm.officerNotes}
                              onChange={e => setMapForm(f => ({ ...f, officerNotes: e.target.value }))} />
                          </div>
                        </div>

                        {mapErr && <p className="text-sm text-red-600">{mapErr}</p>}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setEditingAttr(null); setCatalogClassDetected(null); }} className="btn btn-sm">{t.common.cancel}</button>
                          <button onClick={saveMapping} disabled={savingMap} className="btn btn-primary btn-sm">
                            {savingMap ? t.common.saving : c.saveMapping}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pendingMappings.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-orange-800">
                {c.pendingClassificationBanner.replace("{n}", String(pendingMappings.length))}
              </p>
            </div>
          )}

          {advErr && <p className="text-sm text-red-600">{advErr}</p>}
          {!allMapped && reqAttrs.length > 0 && (
            <p className="text-xs text-amber-700">{c.mapAllBeforeProceeding.replace("{n}", String(reqAttrs.length))}</p>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={() => advance()} disabled={advancing || !allMapped} className="btn btn-primary btn-sm">
              {advancing ? "…" : c.runClassificationCheck}
            </button>
          </div>
        </div>
      )}

      {/* ── CLASSIFICATION_GATE ── */}
      {inFulfillment && stage === "CLASSIFICATION_GATE" && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-ink">{c.classificationGateTitle}</h2>
          {loadingMap ? <div className="py-4 text-center text-muted text-sm">{t.common.loading}</div> : (
            <>
              {blockedMappings.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-red-800">{c.columnsBlocked.replace("{n}", String(blockedMappings.length))}</p>
                  {blockedMappings.map(m => (
                    <div key={m.mappingId} className="text-xs text-red-700">
                      • <strong>{m.requestedAttributeName}</strong>: <SensChip code={m.sensitivityCode} opts={SENSITIVITY_OPTIONS} />
                      {m.catalogClassCode && <span className="ml-1 text-red-600 italic">({c.catalogPrefix.replace("{label}", m.catalogClassLabel ?? m.catalogClassCode)})</span>}
                    </div>
                  ))}
                  <p className="text-xs text-red-600 mt-2">{c.returnToSourceMapping}</p>
                </div>
              )}
              {pendingMappings.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-sm text-amber-800">{c.mappingsPending.replace("{n}", String(pendingMappings.length))}</p>
                  {pendingMappings.map(m => (
                    <div key={m.mappingId} className="text-xs text-amber-700 mt-1">
                      • <strong>{m.requestedAttributeName}</strong>
                      {m.stewardNotifiedAt ? ` — ${c.stewardNotified.replace("{date}", new Date(m.stewardNotifiedAt).toLocaleDateString())}` : ` — ${c.stewardNotYetNotified}`}
                    </div>
                  ))}
                </div>
              )}
              {blockedMappings.length === 0 && pendingMappings.length === 0 && mappings.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-semibold text-green-800">{c.allColumnsCleared.replace("{n}", String(mappings.length))}</p>
                  {mappings.map(m => (
                    <div key={m.mappingId} className="text-xs text-green-700 flex items-center gap-2">
                      • <strong>{m.requestedAttributeName}</strong> — <SensChip code={m.sensitivityCode} opts={SENSITIVITY_OPTIONS} />
                      {m.catalogClassCode && <span className="italic text-green-600">{c.catalogPrefix.replace("{label}", m.catalogClassLabel ?? m.catalogClassCode)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {advErr && <p className="text-sm text-red-600">{advErr}</p>}
              <div className="flex justify-end pt-1">
                <button onClick={() => advance()} disabled={advancing || blockedMappings.length > 0 || pendingMappings.length > 0} className="btn btn-primary btn-sm">
                  {advancing ? "…" : c.proceedToQualityGate}
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
            <h2 className="font-semibold text-sm text-ink">{c.qualityGateTitle}</h2>
            <button onClick={runQualityCheck} disabled={runningQC} className="btn btn-sm text-xs">
              {runningQC ? c.running : c.runDqCheck}
            </button>
          </div>
          <p className="text-xs text-muted">
            {c.qualityGateDesc}
          </p>
          {loadingMap || runningQC ? <div className="py-4 text-center text-muted text-sm">{t.common.loading}</div> : (
            <>
              <div className="space-y-2">
                {mappings.map(m => {
                  // Derive display status from live DQ data (preferred) or stored quality_status
                  const isManual    = m.sourceType !== "CATALOG";
                  const noRules     = !isManual && m.dqRulesCount === 0;
                  const hasRules    = !isManual && m.dqRulesCount > 0;
                  const livePassed  = hasRules && m.dqLatestStatus === "PASSED";
                  const liveFailed  = hasRules && m.dqLatestStatus === "FAILED";
                  const neverRun    = hasRules && !m.dqLatestStatus;
                  const failPct     = Number(m.dqLatestFailPct ?? 0);

                  const cardClass = isManual || noRules
                    ? "border-gray-100 bg-gray-50"
                    : livePassed ? "border-green-200 bg-green-50"
                    : liveFailed ? "border-amber-200 bg-amber-50"
                    : neverRun   ? "border-blue-100 bg-blue-50"
                    : m.qualityStatus === "CLEARED" ? "border-green-200 bg-green-50"
                    : m.qualityStatus === "FLAGGED" ? "border-amber-200 bg-amber-50"
                    : "border-line bg-canvas-soft";

                  return (
                    <div key={m.mappingId} className={`px-4 py-3 rounded-xl border ${cardClass}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-ink">{m.requestedAttributeName}</span>
                          <span className="text-[10px] text-muted ml-2">
                            {isManual
                              ? c.manualPrefix.replace("{parts}", [m.manualSystemName, m.manualEntityName, m.manualColumnName].filter(Boolean).join(" › "))
                              : `${m.dataEntityDisplayName ?? ""} › ${m.dataAttributeDisplayName ?? m.dataAttributeName ?? ""}`}
                          </span>
                          {/* DQ status message */}
                          <div className="mt-1">
                            {isManual && (
                              <p className="text-[11px] text-gray-500 italic">{c.manualNoIndicator}</p>
                            )}
                            {noRules && (
                              <p className="text-[11px] text-gray-500 italic">{c.noDqIndicator}</p>
                            )}
                            {neverRun && (
                              <p className="text-[11px] text-blue-700">
                                {c.rulesDefinedNotRun.replace("{n}", String(m.dqRulesCount))}
                              </p>
                            )}
                            {livePassed && (
                              <p className="text-[11px] text-green-700">
                                {c.dqPassed.replace("{pct}", (100 - failPct).toFixed(1))}
                                {m.dqLatestRunAt && <span className="text-green-600"> · {c.checkedAt.replace("{date}", fmtDate(m.dqLatestRunAt))}</span>}
                              </p>
                            )}
                            {liveFailed && (
                              <p className="text-[11px] text-amber-700">
                                {c.dqIssuesDetected.replace("{pct}", failPct.toFixed(1))}
                                {m.dqLatestRunAt && <span className="text-amber-600"> · {c.checkedAt.replace("{date}", fmtDate(m.dqLatestRunAt))}</span>}
                              </p>
                            )}
                            {/* Show stored review decision if Run DQ Check was clicked */}
                            {m.qualityStatus !== "PENDING" && (m.qualityNotes) && !livePassed && !liveFailed && !neverRun && !noRules && !isManual && (
                              <p className="text-[11px] text-muted italic">{m.qualityNotes}</p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {/* Live DQ badge */}
                          {(isManual || noRules) && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{c.noDqIndicatorBadge}</span>
                          )}
                          {neverRun && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{c.notRunBadge.replace("{n}", String(m.dqRulesCount))}</span>
                          )}
                          {livePassed && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">{c.dqPassedBadge}</span>
                          )}
                          {liveFailed && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{c.dqIssuesBadge}</span>
                          )}
                          {/* Stored review decision badge (shown after Run DQ Check) */}
                          {m.qualityStatus !== "PENDING" && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              m.qualityStatus === "CLEARED" ? "bg-green-50 text-green-600 border border-green-200" :
                              m.qualityStatus === "FLAGGED" ? "bg-amber-50 text-amber-600 border border-amber-200" :
                              "bg-gray-50 text-gray-500 border border-gray-200"
                            }`}>{c.reviewBadge.replace("{status}", m.qualityStatus)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {qualityFlagged.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs text-amber-800">{c.columnsFlagged.replace("{n}", String(qualityFlagged.length))}</p>
                </div>
              )}

              {/* ── Delivery type choice ── */}
              <div className="border border-line rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-ink">{c.deliveryTypeQuestion}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeliveryType("OPEN_DATA")}
                    className={`text-left p-3 rounded-xl border-2 transition-colors ${
                      deliveryType === "OPEN_DATA"
                        ? "border-brand-purple bg-brand-purple/5"
                        : "border-line hover:border-brand-purple/40"
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">{c.publishOpenData}</p>
                    <p className="text-[11px] text-muted mt-1">
                      {c.publishOpenDataDesc}
                    </p>
                    {deliveryType === "OPEN_DATA" && (
                      <span className="mt-2 inline-block text-[10px] font-bold text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded-full">{c.selectedBadge}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setDeliveryType("ONE_OFF")}
                    className={`text-left p-3 rounded-xl border-2 transition-colors ${
                      deliveryType === "ONE_OFF"
                        ? "border-teal-600 bg-teal-50"
                        : "border-line hover:border-teal-400/40"
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">{c.oneOffDelivery}</p>
                    <p className="text-[11px] text-muted mt-1">
                      {c.oneOffDeliveryDesc}
                    </p>
                    {deliveryType === "ONE_OFF" && (
                      <span className="mt-2 inline-block text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">{c.selectedBadge}</span>
                    )}
                  </button>
                </div>

                {deliveryType && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">
                        {c.datasetNameLabel} <span className="font-normal text-muted">{c.datasetNameHint}</span>
                      </label>
                      <input className="input w-full text-sm" placeholder={`${caseData.referenceCode}: ${caseData.subjectText}`}
                        value={datasetName} onChange={e => setDatasetName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">
                        {c.datasetDescLabel} <span className="font-normal text-muted">{c.datasetDescHint}</span>
                      </label>
                      <textarea className="input w-full text-sm h-16 resize-none" placeholder={c.datasetDescPlaceholder}
                        value={datasetDesc} onChange={e => setDatasetDesc(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {advErr && <p className="text-sm text-red-600">{advErr}</p>}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => advance({ deliveryType, datasetName: datasetName || undefined, datasetDescription: datasetDesc || undefined })}
                  disabled={advancing || !deliveryType}
                  className="btn btn-primary btn-sm"
                >
                  {advancing ? "…" : deliveryType === "ONE_OFF" ? c.createRecordAdvance : c.createDatasetAdvance}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TECHNICAL_COMPILATION and later ── */}
      {inFulfillment && stage !== "SOURCE_MAPPING" && stage !== "CLASSIFICATION_GATE" && stage !== "QUALITY_GATE" && stage !== "DELIVERY" && (() => {
        const dsStatus     = caseData.linkedOpenDatasetStatus;
        const dsProcessed  = !!dsStatus && OPEN_DATA_PROCESSED_STATUSES.has(dsStatus);
        const gateBlocking = stage === "TECHNICAL_COMPILATION" && !dsProcessed;

        return (
        <div className="card p-5 space-y-3">
          {stage === "TECHNICAL_COMPILATION" && caseData.linkedOpenDatasetId && (
            caseData.foiDeliveryType === "ONE_OFF" ? (
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-teal-800">{c.oneOffCreatedTitle}</p>
                <p className="text-xs text-teal-700">
                  {c.oneOffCreatedDesc.split("#{id}")[0]}
                  <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="underline font-medium">
                    #{caseData.linkedOpenDatasetId}
                  </a>
                  {c.oneOffCreatedDesc.split("#{id}")[1]}
                </p>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-blue-800">{c.openDataCreatedTitle}</p>
                <p className="text-xs text-blue-700">
                  {c.openDataCreatedDesc.split("#{id}")[0]}
                  <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="underline font-semibold">
                    #{caseData.linkedOpenDatasetId}
                  </a>
                  {c.openDataCreatedDesc.split("#{id}")[1]}
                </p>
              </div>
            )
          )}

          {gateBlocking && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-amber-800">{c.datasetNotProcessedTitle}</p>
              <p className="text-xs text-amber-700">
                {c.datasetNotProcessedDesc.replace("{status}", dsStatus ?? "—")}
              </p>
            </div>
          )}

          {advErr && <p className="text-sm text-red-600">{advErr}</p>}
          <div className="flex justify-end">
            <button onClick={() => advance()} disabled={advancing || gateBlocking} className="btn btn-primary btn-sm">
              {advancing ? "…" : c.markStageComplete}
            </button>
          </div>
        </div>
        );
      })()}

      {/* ── DELIVERY ── */}
      {inFulfillment && stage === "DELIVERY" && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-ink">{c.deliverToRequester}</h2>
          {caseData.linkedOpenDatasetId && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              {c.linkedDatasetNote.split("#{id}")[0]}
              <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="underline font-medium">
                #{caseData.linkedOpenDatasetId}
              </a>
              {c.linkedDatasetNote.split("#{id}")[1]}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.deliveryRefLabel} <span className="text-red-500">*</span></label>
            <input className="input w-full" placeholder={c.deliveryRefPlaceholder} value={delivRef} onChange={e => setDelivRef(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.deliveryMessageLabel}</label>
            <textarea className="input w-full h-20 resize-none" placeholder={c.deliveryMessagePlaceholder} value={delivMsg} onChange={e => setDelivMsg(e.target.value)} />
          </div>
          {advErr && <p className="text-sm text-red-600">{advErr}</p>}
          <div className="flex justify-end">
            <button onClick={deliver} disabled={advancing} className="btn btn-primary btn-sm">
              {advancing ? "…" : c.confirmDelivery}
            </button>
          </div>
        </div>
      )}

      {/* ── DELIVERED ── */}
      {caseData.statusCode === "DELIVERED" && (
        <div className="card p-5 bg-green-50 border border-green-200 space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm text-green-800">{c.caseDeliveredTitle}</h2>
            {caseData.foiDeliveryType === "ONE_OFF" && (
              <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{c.oneOffBadge}</span>
            )}
            {caseData.foiDeliveryType === "OPEN_DATA" && (
              <span className="text-[10px] font-bold bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded-full">{c.openDataBadge}</span>
            )}
          </div>
          <p className="text-xs text-green-700">{c.deliveryReferenceLabel} <span className="font-mono">{caseData.deliveryReference}</span></p>
          {caseData.linkedOpenDatasetId && (
            <a href={`/open-data/${caseData.linkedOpenDatasetId}`} target="_blank" rel="noreferrer" className="text-xs text-brand-purple hover:underline block">
              {(caseData.foiDeliveryType === "ONE_OFF" ? c.viewOneOffRecord : c.viewOpenDataDataset).replace("{id}", String(caseData.linkedOpenDatasetId))}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
