"use client";

import { useEffect, useState } from "react";
import { DOMAIN_MANAGE_ROLE_NAME } from "@/lib/domain-roles";
import { useLang } from "@/lib/lang-context";
import type { DomainCode } from "@/lib/can";
import type { RequestTypeCode, RequestPriority } from "@/lib/types";
import type { AccessRequestRow, CatalogResourceType } from "@/lib/queries/access-requests";
import type { I18nStrings } from "@/lib/i18n/strings";

// The single "New Request" form, used from the sidebar page and from asset pages.
// "Access" is one of the request types: it files a real access request (a data
// source, schema or table, or a feature domain) that grants the access once
// approved. "Report a data breach" records a personal data breach in the breach
// register (lib/privacy/breach.ts), open to everyone since anyone may discover one.
// Every other type raises an asset request that follows its workflow.

export interface RequestTarget {
  assetTypeCode: string;
  assetId:       number;
  assetName:     string;
}

export type NewRequestType = RequestTypeCode | "ACCESS" | "BREACH";
export type NewRequestResult = { kind: "ACCESS" } | { kind: "ASSET"; requestId?: number } | { kind: "BREACH"; breachId: number; reference: string | null; canOpen: boolean };

type CatalogItem = { id: number; name: string };

const ALL_DOMAINS: DomainCode[] = ["GOVERNANCE", "DATA_QUALITY", "DATA_PRIVACY", "SHARING", "FOI", "OPEN_DATA"];

const ACCESS_LEVEL_OF_ASSET: Record<string, CatalogResourceType> = {
  DATA_SOURCES: "DATA_SOURCE", DATA_SCHEMAS: "SCHEMA", DATA_ENTITIES: "TABLE",
};

function buildRequestTypes(c: I18nStrings["catalog"], b: I18nStrings["breach"]): { code: NewRequestType; label: string; desc: string; icon: string }[] {
  return [
    { code: "ACCESS",            label: c.reqTypeAccess,            desc: c.reqTypeAccessDesc,            icon: "🔓" },
    { code: "FIX_DATA_ISSUE",    label: c.reqTypeFixDataIssue,      desc: c.reqTypeFixDataIssueDesc,      icon: "🔧" },
    { code: "UPDATE_DEFINITION", label: c.reqTypeUpdateDefinition,  desc: c.reqTypeUpdateDefinitionDesc,  icon: "📝" },
    { code: "CERTIFY_ASSET",     label: c.reqTypeCertifyAsset,      desc: c.reqTypeCertifyAssetDesc,      icon: "🏅" },
    { code: "REMOVE_ACCESS",     label: c.reqTypeRemoveAccess,      desc: c.reqTypeRemoveAccessDesc,      icon: "🔒" },
    { code: "CLEANUP_DATA_ASSET", label: c.reqTypeCleanup,          desc: c.reqTypeCleanupDesc,           icon: "🧹" },
    { code: "OTHER",             label: c.reqTypeOther,             desc: c.reqTypeOtherDesc,             icon: "💬" },
    { code: "BREACH",            label: b.newRequestLabel,          desc: b.newRequestDesc,               icon: "🚨" },
  ];
}

function buildPriorityOptions(c: I18nStrings["catalog"]): { code: RequestPriority; label: string; desc: string; color: string }[] {
  return [
    { code: "HIGH",   label: c.priorityHigh,   desc: c.priorityHighDesc,   color: "border-red-400    bg-red-50    text-red-700"   },
    { code: "MEDIUM", label: c.priorityMedium, desc: c.priorityMediumDesc, color: "border-amber-400  bg-amber-50  text-amber-700" },
    { code: "LOW",    label: c.priorityLow,    desc: c.priorityLowDesc,    color: "border-gray-300   bg-gray-50   text-gray-600"  },
  ];
}

export function NewRequestForm({
  prefilledTarget,
  entities,
  initialRequestType,
  variant = "page",
  onCancel,
  onSaved,
}: {
  prefilledTarget?:     RequestTarget;
  entities?:            { entityId: number; entityName: string }[];
  initialRequestType?:  NewRequestType;
  variant?:             "page" | "modal";
  onCancel?:            () => void;
  onSaved:              (result: NewRequestResult) => void;
}) {
  const { t } = useLang();
  const c = t.catalog;
  const a = t.requestAccess;
  const REQUEST_TYPES = buildRequestTypes(c, t.breach);
  const PRIORITY_OPTIONS = buildPriorityOptions(c);
  const domainLabel = (d: DomainCode): string => ({
    GOVERNANCE: t.nav.governance, DATA_QUALITY: t.nav.quality, DATA_PRIVACY: t.nav.privacy,
    SHARING: t.nav.sharing, FOI: t.nav.foi, OPEN_DATA: t.nav.openData,
  })[d];
  const resourceLevelLabel = (rt: CatalogResourceType): string => ({
    DATA_SOURCE: a.resourceLevelSource, SCHEMA: a.resourceLevelSchema, TABLE: a.resourceLevelTable,
  })[rt];

  // Older callers asked for the "Grant Access" asset request; that is the Access type now.
  const startType: NewRequestType | "" = initialRequestType === "GRANT_ACCESS" ? "ACCESS" : initialRequestType ?? "";
  const [requestType, setRequestType] = useState<NewRequestType | "">(startType);
  const isAccess = requestType === "ACCESS";
  const isBreach = requestType === "BREACH";
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── Data source → schema → table picker (access object, or the asset a request is about) ──
  const [sources, setSources] = useState<CatalogItem[]>([]);
  const [schemas, setSchemas] = useState<CatalogItem[]>([]);
  const [tables,  setTables]  = useState<CatalogItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [schemaId, setSchemaId] = useState("");
  const [tableId,  setTableId]  = useState("");

  function selectSource(id: string) {
    setSourceId(id); setSchemaId(""); setTableId(""); setSchemas([]); setTables([]);
    if (id) fetch(`/api/access-requests/catalog-lookup?type=schemas&sourceId=${id}`).then((r) => r.json()).then(setSchemas).catch(() => {});
  }
  function selectSchema(id: string) {
    setSchemaId(id); setTableId(""); setTables([]);
    if (id) fetch(`/api/access-requests/catalog-lookup?type=tables&schemaId=${id}`).then((r) => r.json()).then(setTables).catch(() => {});
  }
  const nameOf = (items: CatalogItem[], id: string) => items.find((s) => String(s.id) === id)?.name ?? id;

  // ── Access request state ────────────────────────────────────────────────
  const prefilledAccessLevel = prefilledTarget ? ACCESS_LEVEL_OF_ASSET[prefilledTarget.assetTypeCode] : undefined;
  const [kind, setKind] = useState<"DOMAIN" | "CATALOG">("CATALOG");
  const [domain, setDomain] = useState<DomainCode | "">("");
  const [level, setLevel] = useState<CatalogResourceType>("TABLE");
  const [justification, setJustification] = useState("");
  const [mine, setMine] = useState<AccessRequestRow[]>([]);
  const [domainAccess, setDomainAccess] = useState<Partial<Record<DomainCode, "WRITE" | "READ" | "NONE">>>({});

  useEffect(() => {
    if (!isAccess) return;
    fetch("/api/access-requests").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setMine(d.mine ?? []);
      setDomainAccess(d.domainAccess ?? {});
    }).catch(() => {});
  }, [isAccess]);

  // The chosen domain can't be requested when the user already has it (read or manage)
  // or already has a request waiting: say so instead of taking another request.
  const domainBlock: string | null = !isAccess || kind !== "DOMAIN" || !domain ? null
    : domainAccess[domain] === "WRITE" ? t.accessApproval.alreadyManage.replace("{domain}", domainLabel(domain))
    : domainAccess[domain] === "READ" ? t.accessApproval.alreadyRead.replace("{domain}", domainLabel(domain))
    : mine.some((r) => r.requestKind === "DOMAIN" && r.domainCode === domain && r.statusCode === "PENDING") ? t.accessApproval.alreadyPending.replace("{domain}", domainLabel(domain))
    : null;

  // ── Asset request state ─────────────────────────────────────────────────
  const [priority,    setPriority]    = useState<RequestPriority>("MEDIUM");
  const [title,       setTitle]       = useState(
    startType && startType !== "ACCESS" && startType !== "BREACH" ? REQUEST_TYPES.find((rt) => rt.code === startType)?.label ?? "" : ""
  );
  const [description, setDescription] = useState("");
  const [targets,     setTargets]     = useState<RequestTarget[]>(prefilledTarget ? [prefilledTarget] : []);

  // The picker is needed whenever the form was not opened on a specific asset.
  const needsPicker = !prefilledTarget || (isAccess && kind === "CATALOG" && !prefilledAccessLevel);
  useEffect(() => {
    if (!requestType || !needsPicker || sources.length > 0) return;
    fetch("/api/access-requests/catalog-lookup?type=sources").then((r) => r.json()).then(setSources).catch(() => {});
  }, [requestType, needsPicker, sources.length]);

  // Without a prefilled asset, the request is about the deepest object picked.
  const pickedTarget: RequestTarget | null =
    tableId  ? { assetTypeCode: "DATA_ENTITIES", assetId: Number(tableId),  assetName: nameOf(tables, tableId) }
    : schemaId ? { assetTypeCode: "DATA_SCHEMAS",  assetId: Number(schemaId), assetName: nameOf(schemas, schemaId) }
    : sourceId ? { assetTypeCode: "DATA_SOURCES",  assetId: Number(sourceId), assetName: nameOf(sources, sourceId) }
    : null;
  const effectiveTargets = prefilledTarget ? targets : pickedTarget ? [pickedTarget] : [];

  // Clean-up: the whole table, or chosen columns of it (only when raised on a table).
  const cleanupTable = prefilledTarget?.assetTypeCode === "DATA_ENTITIES" ? prefilledTarget : null;
  const isCleanup = requestType === "CLEANUP_DATA_ASSET";
  const [cleanupScope, setCleanupScope] = useState<"TABLE" | "COLUMNS">("TABLE");
  const [columns, setColumns] = useState<{ attributeId: number; physicalName: string }[] | null>(null);
  const [pickedColumns, setPickedColumns] = useState<number[]>([]);
  useEffect(() => {
    if (!isCleanup || cleanupScope !== "COLUMNS" || !cleanupTable || columns) return;
    fetch(`/api/catalog/entities/${cleanupTable.assetId}/columns`).then((r) => (r.ok ? r.json() : [])).then((d) => setColumns(Array.isArray(d) ? d : Array.isArray(d?.columns) ? d.columns : []));
  }, [isCleanup, cleanupScope, cleanupTable, columns]);
  const columnTargets: RequestTarget[] = (columns ?? []).filter((col) => pickedColumns.includes(col.attributeId))
    .map((col) => ({ assetTypeCode: "DATA_ATTRIBUTES", assetId: col.attributeId, assetName: `${cleanupTable?.assetName}.${col.physicalName}` }));
  const useColumns = isCleanup && cleanupScope === "COLUMNS" && !!cleanupTable;

  // Additional entity targets from the same schema
  const availableEntities = (entities ?? []).filter(
    (e) => !targets.some((tg) => tg.assetTypeCode === "DATA_ENTITIES" && tg.assetId === e.entityId)
  );

  async function submitAccess() {
    let body: Record<string, unknown>;
    if (kind === "DOMAIN") {
      if (!domain) { setError(a.domainPlaceholder); return; }
      body = { kind: "DOMAIN", domain, justification: justification.trim() || undefined };
    } else if (prefilledTarget && prefilledAccessLevel) {
      body = {
        kind: "CATALOG", resourceType: prefilledAccessLevel, resourceId: String(prefilledTarget.assetId),
        resourceName: prefilledTarget.assetName, justification: justification.trim() || undefined,
      };
    } else {
      const resourceId = level === "DATA_SOURCE" ? sourceId : level === "SCHEMA" ? schemaId : tableId;
      if (!resourceId) {
        setError(level === "DATA_SOURCE" ? a.dataSourcePlaceholder : level === "SCHEMA" ? a.schemaPlaceholder : a.tablePlaceholder);
        return;
      }
      const resourceName = nameOf(level === "DATA_SOURCE" ? sources : level === "SCHEMA" ? schemas : tables, resourceId);
      body = { kind: "CATALOG", resourceType: level, resourceId, resourceName, justification: justification.trim() || undefined };
    }

    setSaving(true);
    try {
      const r = await fetch("/api/access-requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const name = kind === "DOMAIN" && domain ? domainLabel(domain) : "";
        setError(
          err.code === "ALREADY_READ" ? t.accessApproval.alreadyRead.replace("{domain}", name)
          : err.code === "ALREADY_MANAGE" ? t.accessApproval.alreadyManage.replace("{domain}", name)
          : err.code === "ALREADY_PENDING" ? t.accessApproval.alreadyPending.replace("{domain}", name || (body.resourceName as string) || "")
          : a.submitFailed
        );
        return;
      }
      onSaved({ kind: "ACCESS" });
    } finally {
      setSaving(false);
    }
  }

  async function submitAsset() {
    if (!title.trim())  { setError(c.enterTitleErr); return; }
    if (effectiveTargets.length === 0) { setError(c.targetRequiredErr); return; }
    if (useColumns && columnTargets.length === 0) { setError(c.cleanupPickColumnsErr); return; }

    setSaving(true);
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestTypeCode: requestType,
          title: title.trim(),
          descriptionText: description.trim() || null,
          priorityCode: priority,
          targets: useColumns ? columnTargets : effectiveTargets,
        }),
      });
      const d = await r.json().catch(() => ({ error: c.unknownErr }));
      if (!r.ok) { setError(d.error ?? c.submitRequestFailed); return; }
      onSaved({ kind: "ASSET", requestId: d.requestId });
    } finally {
      setSaving(false);
    }
  }

  // ── Data breach ─────────────────────────────────────────────────────────
  const nowLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const [awareAt, setAwareAt] = useState(nowLocal);
  const [reported, setReported] = useState<Extract<NewRequestResult, { kind: "BREACH" }> | null>(null);

  async function submitBreach() {
    if (!title.trim()) { setError(t.breach.errors.TITLE_REQUIRED); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/privacy/breaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          discoveredAt: awareAt ? new Date(awareAt).toISOString() : null,
          assets: effectiveTargets.map((tg) => ({ typeCode: tg.assetTypeCode, id: tg.assetId })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError((t.breach.errors as Record<string, string>)[d.code] ?? d.error ?? t.breach.failed); return; }
      const result = { kind: "BREACH" as const, breachId: d.breachId, reference: d.reference ?? null, canOpen: !!d.canOpen };
      // In a dialog, confirm here before closing; the page shows its own confirmation.
      if (variant === "modal") setReported(result); else onSaved(result);
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    setError(null);
    if (!requestType) { setError(c.selectRequestTypeErr); return; }
    void (isAccess ? submitAccess() : isBreach ? submitBreach() : submitAsset());
  }

  const sourceSelect = (
    <div>
      <label className="field-label">{a.dataSourceLabel}</label>
      <select className="input-field" value={sourceId} onChange={(e) => selectSource(e.target.value)}>
        <option value="">{a.dataSourcePlaceholder}</option>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
  const schemaSelect = (
    <div>
      <label className="field-label">{a.schemaLabel}</label>
      <select className="input-field" value={schemaId} onChange={(e) => selectSchema(e.target.value)}>
        <option value="">{a.schemaPlaceholder}</option>
        {schemas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
  const tableSelect = (
    <div>
      <label className="field-label">{a.tableLabel}</label>
      <select className="input-field" value={tableId} onChange={(e) => setTableId(e.target.value)}>
        <option value="">{a.tablePlaceholder}</option>
        {tables.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
  const targetChip = (tg: RequestTarget, onRemove?: () => void) => (
    <div className="flex items-center gap-2 px-3 py-2 bg-canvas border border-line rounded-lg">
      <span className="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">
        {tg.assetTypeCode.replace("DATA_", "")}
      </span>
      <span className="text-[12px] font-mono font-semibold text-brand-deep flex-1 truncate">{tg.assetName}</span>
      {onRemove && <button onClick={onRemove} className="text-muted hover:text-red-500 text-sm leading-none">&times;</button>}
    </div>
  );

  if (reported) {
    return (
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm px-3 py-2 rounded-md border text-emerald-700 bg-emerald-50 border-emerald-200"><BreachReported result={reported} /></p>
        <div className="flex justify-end"><button onClick={() => onSaved(reported)} className="btn btn-primary">{t.breach.done}</button></div>
      </div>
    );
  }

  return (
    <>
      <div className={`space-y-5 ${variant === "modal" ? "px-6 py-5" : ""}`}>
        {/* Request type */}
        <div>
          <label className="field-label">{c.requestTypeLabel}</label>
          <div className={`grid gap-2 ${variant === "modal" ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
            {REQUEST_TYPES.map((rt) => (
              <button
                key={rt.code}
                type="button"
                onClick={() => {
                  setRequestType(rt.code); setError(null);
                  // Keep a title the user typed; replace an empty one or another type's default.
                  // A breach gets its own title (what happened), not the type's name.
                  if (rt.code !== "ACCESS" && (!title || REQUEST_TYPES.some((x) => x.label === title))) setTitle(rt.code === "BREACH" ? "" : rt.label);
                }}
                className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                  requestType === rt.code
                    ? "border-brand-purple bg-brand-purple/5"
                    : "border-line hover:border-brand-purple/40"
                }`}
              >
                <div className="text-base leading-none mb-1">{rt.icon}</div>
                <div className="text-[12px] font-semibold text-brand-deep">{rt.label}</div>
                <div className="text-[10px] text-muted mt-0.5 leading-tight">{rt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Access ── */}
        {isAccess && (
          <>
            <div>
              <label className="field-label">{a.kindLabel}</label>
              <div className="grid grid-cols-2 gap-2">
                {([["CATALOG", a.kindCatalogOption, a.kindCatalogDesc], ["DOMAIN", a.kindDomainOption, a.kindDomainDesc]] as const).map(([k, label, desc]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setKind(k); setError(null); }}
                    className={`text-left px-3.5 py-3 rounded-lg border-2 transition-colors ${
                      kind === k ? "border-brand-purple bg-brand-purple/5" : "border-line hover:border-brand-purple/40"
                    }`}
                  >
                    <div className="text-[13px] font-semibold text-brand-deep">{label}</div>
                    <div className="text-[11px] text-muted mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {kind === "DOMAIN" ? (
              <div>
                <label className="field-label">{a.domainLabel}</label>
                <select className="input-field" value={domain} onChange={(e) => setDomain(e.target.value as DomainCode)}>
                  <option value="">{a.domainPlaceholder}</option>
                  {ALL_DOMAINS.map((d) => <option key={d} value={d}>{domainLabel(d)}</option>)}
                </select>
                {domain && !domainBlock && <p className="text-[11px] text-muted mt-1">{t.accessApproval.approvedBy.replace("{role}", DOMAIN_MANAGE_ROLE_NAME[domain])}</p>}
                {domainBlock && (
                  <p className="text-[13px] text-sky-800 bg-sky-50 border border-sky-200 rounded-md px-3 py-2 mt-2">{domainBlock}</p>
                )}
              </div>
            ) : prefilledTarget && prefilledAccessLevel ? (
              <div>
                <label className="field-label">{resourceLevelLabel(prefilledAccessLevel)}</label>
                {targetChip(prefilledTarget)}
              </div>
            ) : (
              <>
                <div>
                  <label className="field-label">{a.resourceLevelLabel}</label>
                  <div className="flex gap-2">
                    {(["DATA_SOURCE", "SCHEMA", "TABLE"] as CatalogResourceType[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLevel(lvl)}
                        className={`flex-1 py-2 px-3 rounded-lg border-2 text-[12px] font-bold transition-colors ${
                          level === lvl ? "border-brand-purple bg-brand-purple/5 text-brand-purple" : "border-line text-ink hover:border-brand-purple/30"
                        }`}
                      >
                        {resourceLevelLabel(lvl)}
                      </button>
                    ))}
                  </div>
                </div>
                {sourceSelect}
                {level !== "DATA_SOURCE" && sourceId && schemaSelect}
                {level === "TABLE" && schemaId && tableSelect}
              </>
            )}

            <div>
              <label className="field-label">{a.justificationLabel} <span className="text-muted font-normal normal-case">{a.justificationOptional}</span></label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder={a.justificationPlaceholder}
              />
            </div>
          </>
        )}

        {/* ── Data breach ── */}
        {isBreach && (
          <>
            <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{t.breach.newRequestNote} {t.breach.reportHint}</p>
            <div>
              <label className="field-label">{t.breach.fTitle}</label>
              <input className="input-field" value={title} maxLength={255} dir="auto" placeholder={t.breach.titlePh} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{t.breach.fDescription}</label>
              <textarea className="input-field resize-none" rows={3} value={description} dir="auto" placeholder={t.breach.descriptionPh} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{t.breach.fDiscoveredAt}</label>
              <input type="datetime-local" className="input-field" value={awareAt} max={nowLocal()} onChange={(e) => setAwareAt(e.target.value)} />
              <p className="text-[11px] text-muted mt-1">{t.breach.discoveredHint}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="field-label">{t.breach.fAssets}</label>
                <p className="text-[11px] text-muted -mt-1">{t.breach.assetsHint}</p>
              </div>
              {prefilledTarget
                ? targets.map((tg, idx) => <div key={idx}>{targetChip(tg, () => setTargets((prev) => prev.filter((_, i) => i !== idx)))}</div>)
                : <>{sourceSelect}{sourceId && schemaSelect}{schemaId && tableSelect}</>}
            </div>
          </>
        )}

        {/* ── Every other request type ── */}
        {requestType && !isAccess && !isBreach && (
          <>
            {isCleanup && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5 space-y-2">
                <p className="text-[11px] text-rose-900 leading-snug">{c.cleanupFlowNote}</p>
                {cleanupTable && (
                  <div>
                    <div className="text-[11px] font-semibold text-ink mb-1">{c.cleanupScopeLabel}</div>
                    <div className="flex gap-4 text-[12px] text-ink">
                      <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" className="accent-brand-purple" checked={cleanupScope === "TABLE"} onChange={() => setCleanupScope("TABLE")} />{c.cleanupScopeTable}</label>
                      <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" className="accent-brand-purple" checked={cleanupScope === "COLUMNS"} onChange={() => setCleanupScope("COLUMNS")} />{c.cleanupScopeColumns}</label>
                    </div>
                    {cleanupScope === "COLUMNS" && (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-line bg-white px-2 py-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                        {!columns && <span className="text-[11px] text-muted">…</span>}
                        {columns && columns.length === 0 && <span className="text-[11px] text-muted col-span-2">No columns are cataloged for this table.</span>}
                        {(columns ?? []).map((col) => (
                          <label key={col.attributeId} className="flex items-center gap-1.5 text-[12px] font-mono text-ink cursor-pointer truncate" dir="ltr">
                            <input type="checkbox" className="accent-brand-purple shrink-0" checked={pickedColumns.includes(col.attributeId)}
                              onChange={(e) => setPickedColumns((p) => (e.target.checked ? [...p, col.attributeId] : p.filter((x) => x !== col.attributeId)))} />
                            {col.physicalName}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Priority */}
            <div>
              <label className="field-label">{c.priorityLabel}</label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPriority(p.code)}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-[12px] font-bold transition-colors ${
                      priority === p.code
                        ? p.color + " ring-2 ring-offset-1 ring-brand-purple/30"
                        : "border-line bg-white text-ink hover:border-brand-purple/30"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-1">
                {PRIORITY_OPTIONS.find((p) => p.code === priority)?.desc}
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="field-label">{c.titleLabel}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
                placeholder={c.titlePlaceholder}
              />
            </div>

            {/* Description */}
            <div>
              <label className="field-label">{c.detailsLabel} <span className="text-muted font-normal normal-case">{c.detailsOptional}</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder={c.detailsPlaceholder}
              />
            </div>

            {/* Target assets */}
            {prefilledTarget ? (
              <div>
                <label className="field-label">{c.targetAssetsLabel}</label>
                <div className="space-y-1.5 mb-2">
                  {targets.map((tg, idx) => (
                    <div key={idx}>
                      {targetChip(tg, targets.length > 1 ? () => setTargets((prev) => prev.filter((_, i) => i !== idx)) : undefined)}
                    </div>
                  ))}
                </div>

                {/* Add more tables from same schema */}
                {availableEntities.length > 0 && (
                  <details className="text-[12px]">
                    <summary className="cursor-pointer text-brand-purple hover:underline select-none">
                      {c.addAnotherTable}
                    </summary>
                    <div className="mt-2 border border-line rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                      {availableEntities.map((e) => (
                        <button
                          key={e.entityId}
                          onClick={() => setTargets((prev) => [...prev, { assetTypeCode: "DATA_ENTITIES", assetId: e.entityId, assetName: e.entityName }])}
                          className="w-full text-left px-3 py-2 text-[12px] font-mono hover:bg-canvas-soft border-b border-line-soft last:border-0"
                        >
                          {e.entityName}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="field-label">{c.targetAssetsLabel}</label>
                  <p className="text-[11px] text-muted -mt-1">{c.targetPickerHint}</p>
                </div>
                {sourceSelect}
                {sourceId && schemaSelect}
                {schemaId && tableSelect}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}
      </div>

      <div className={`flex justify-end gap-2 ${variant === "modal" ? "px-6 py-4 border-t border-line" : "pt-5"}`}>
        {onCancel && <button onClick={onCancel} className="btn">{t.common.cancel}</button>}
        <button onClick={submit} disabled={saving || !!domainBlock} className="btn btn-primary">
          {saving ? t.common.submitting : isBreach ? t.breach.submit : c.submitRequestBtn}
        </button>
      </div>
    </>
  );
}

/** "Breach BR-2026-0001 reported…", with a link when the reporter can open Data Privacy. */
export function BreachReported({ result }: { result: Extract<NewRequestResult, { kind: "BREACH" }> }) {
  const { t } = useLang();
  return (
    <>
      {t.breach.submitted.replace("{ref}", result.reference ?? "")}{" "}
      {result.canOpen && <a href={`/privacy/breaches/${result.breachId}`} className="font-semibold underline">{t.breach.openIt}</a>}
    </>
  );
}
