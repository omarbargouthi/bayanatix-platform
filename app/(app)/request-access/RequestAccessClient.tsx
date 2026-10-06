"use client";

import { useState, useEffect, useCallback } from "react";
import { DOMAIN_MANAGE_ROLE_NAME } from "@/lib/domain-roles";
import { useLang } from "@/lib/lang-context";
import type { DomainCode } from "@/lib/can";
import type { AccessRequestRow, CatalogResourceType } from "@/lib/queries/access-requests";

const ALL_DOMAINS: DomainCode[] = ["GOVERNANCE", "DATA_QUALITY", "DATA_PRIVACY", "SHARING", "FOI", "OPEN_DATA"];

type CatalogItem = { id: number; name: string };
type Tab = "new" | "mine" | "pending";

export function RequestAccessClient() {
  const { t } = useLang();
  const c = t.requestAccess;
  const domainLabel = (d: DomainCode): string => ({
    GOVERNANCE: t.nav.governance, DATA_QUALITY: t.nav.quality, DATA_PRIVACY: t.nav.privacy,
    SHARING: t.nav.sharing, FOI: t.nav.foi, OPEN_DATA: t.nav.openData,
  })[d];
  const resourceLevelLabel = (rt: CatalogResourceType): string => ({
    DATA_SOURCE: c.resourceLevelSource, SCHEMA: c.resourceLevelSchema, TABLE: c.resourceLevelTable,
  })[rt];

  const [tab, setTab] = useState<Tab>("new");
  const [mine, setMine] = useState<AccessRequestRow[]>([]);
  const [pendingForMe, setPendingForMe] = useState<AccessRequestRow[]>([]);

  const loadRequests = useCallback(async () => {
    const r = await fetch("/api/access-requests");
    if (!r.ok) return;
    const d: { mine: AccessRequestRow[]; pendingForMe: AccessRequestRow[] } = await r.json();
    setMine(d.mine);
    setPendingForMe(d.pendingForMe);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);
  // Notification links land on the right tab (?tab=pending | mine).
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "pending" || requested === "mine" || requested === "new") setTab(requested);
  }, []);

  // ── New request form state ──────────────────────────────────────────────
  const [kind, setKind] = useState<"DOMAIN" | "CATALOG">("DOMAIN");
  const [domain, setDomain] = useState<DomainCode | "">("");
  const [level, setLevel] = useState<CatalogResourceType>("TABLE");
  const [sources, setSources] = useState<CatalogItem[]>([]);
  const [schemas, setSchemas] = useState<CatalogItem[]>([]);
  const [tables, setTables] = useState<CatalogItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [schemaId, setSchemaId] = useState("");
  const [tableId, setTableId] = useState("");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (kind === "CATALOG" && sources.length === 0) {
      fetch("/api/access-requests/catalog-lookup?type=sources").then((r) => r.json()).then(setSources).catch(() => {});
    }
  }, [kind, sources.length]);

  function selectSource(id: string) {
    setSourceId(id); setSchemaId(""); setTableId(""); setSchemas([]); setTables([]);
    if (id && level !== "DATA_SOURCE") {
      fetch(`/api/access-requests/catalog-lookup?type=schemas&sourceId=${id}`).then((r) => r.json()).then(setSchemas).catch(() => {});
    }
  }

  function selectSchema(id: string) {
    setSchemaId(id); setTableId(""); setTables([]);
    if (id && level === "TABLE") {
      fetch(`/api/access-requests/catalog-lookup?type=tables&schemaId=${id}`).then((r) => r.json()).then(setTables).catch(() => {});
    }
  }

  function resetForm() {
    setDomain(""); setLevel("TABLE"); setSourceId(""); setSchemaId(""); setTableId("");
    setSchemas([]); setTables([]); setJustification("");
  }

  async function submit() {
    setMessage(null);
    let body: Record<string, unknown>;
    if (kind === "DOMAIN") {
      if (!domain) return;
      body = { kind: "DOMAIN", domain, justification: justification.trim() || undefined };
    } else {
      const resourceId = level === "DATA_SOURCE" ? sourceId : level === "SCHEMA" ? schemaId : tableId;
      if (!resourceId) return;
      const resourceName =
        level === "DATA_SOURCE" ? sources.find((s) => String(s.id) === resourceId)?.name
        : level === "SCHEMA" ? schemas.find((s) => String(s.id) === resourceId)?.name
        : tables.find((s) => String(s.id) === resourceId)?.name;
      body = { kind: "CATALOG", resourceType: level, resourceId, resourceName, justification: justification.trim() || undefined };
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/access-requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { setMessage({ ok: false, text: c.submitFailed }); return; }
      setMessage({ ok: true, text: c.submitSuccess });
      resetForm();
      await loadRequests();
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(requestId: number, decision: "APPROVED" | "REJECTED") {
    const r = await fetch(`/api/access-requests/${requestId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    });
    if (r.ok) await loadRequests();
  }

  function describeRequest(row: AccessRequestRow): string {
    return row.requestKind === "DOMAIN"
      ? c.domainRequestLabel.replace("{domain}", row.domainCode ? domainLabel(row.domainCode) : "—")
      : c.catalogRequestLabel
          .replace("{level}", row.resourceType ? resourceLevelLabel(row.resourceType) : "—")
          .replace("{name}", row.resourceName ?? row.resourceId ?? "—");
  }

  function StatusTag({ status }: { status: AccessRequestRow["statusCode"] }) {
    const cls = status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-red-50 text-red-700 border-red-200";
    const label = status === "PENDING" ? c.statusPending : status === "APPROVED" ? c.statusApproved : c.statusRejected;
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
  }

  return (
    <div className="max-w-3xl">
      <p className="text-[13px] text-muted mb-5">{c.pageDesc}</p>

      <div className="flex gap-1 border-b border-line mb-5">
        {([
          ["new", c.tabNewRequest],
          ["mine", c.tabMyRequests],
          ["pending", c.tabPendingApproval],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? "border-brand-purple text-brand-purple" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
            {key === "pending" && pendingForMe.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center text-[10px] bg-brand-purple text-white rounded-full w-4 h-4">
                {pendingForMe.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "new" && (
        <div className="card p-5 space-y-5">
          <div>
            <label className="field-label">{c.kindLabel}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("DOMAIN")}
                className={`text-left px-3.5 py-3 rounded-lg border-2 transition-colors ${
                  kind === "DOMAIN" ? "border-brand-purple bg-brand-purple/5" : "border-line hover:border-brand-purple/40"
                }`}
              >
                <div className="text-[13px] font-semibold text-brand-deep">{c.kindDomainOption}</div>
                <div className="text-[11px] text-muted mt-0.5">{c.kindDomainDesc}</div>
              </button>
              <button
                type="button"
                onClick={() => setKind("CATALOG")}
                className={`text-left px-3.5 py-3 rounded-lg border-2 transition-colors ${
                  kind === "CATALOG" ? "border-brand-purple bg-brand-purple/5" : "border-line hover:border-brand-purple/40"
                }`}
              >
                <div className="text-[13px] font-semibold text-brand-deep">{c.kindCatalogOption}</div>
                <div className="text-[11px] text-muted mt-0.5">{c.kindCatalogDesc}</div>
              </button>
            </div>
          </div>

          {kind === "DOMAIN" ? (
            <div>
              <label className="field-label">{c.domainLabel}</label>
              <select className="input-field" value={domain} onChange={(e) => setDomain(e.target.value as DomainCode)}>
                <option value="">{c.domainPlaceholder}</option>
                {ALL_DOMAINS.map((d) => <option key={d} value={d}>{domainLabel(d)}</option>)}
              </select>
              {domain && <p className="text-[11px] text-muted mt-1">{t.accessApproval.approvedBy.replace("{role}", DOMAIN_MANAGE_ROLE_NAME[domain])}</p>}
            </div>
          ) : (
            <>
              <div>
                <label className="field-label">{c.resourceLevelLabel}</label>
                <div className="flex gap-2">
                  {(["DATA_SOURCE", "SCHEMA", "TABLE"] as CatalogResourceType[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => { setLevel(lvl); setSchemaId(""); setTableId(""); setTables([]); }}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-[12px] font-bold transition-colors ${
                        level === lvl ? "border-brand-purple bg-brand-purple/5 text-brand-purple" : "border-line text-ink hover:border-brand-purple/30"
                      }`}
                    >
                      {resourceLevelLabel(lvl)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label">{c.dataSourceLabel}</label>
                <select className="input-field" value={sourceId} onChange={(e) => selectSource(e.target.value)}>
                  <option value="">{c.dataSourcePlaceholder}</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {(level === "SCHEMA" || level === "TABLE") && sourceId && (
                <div>
                  <label className="field-label">{c.schemaLabel}</label>
                  <select className="input-field" value={schemaId} onChange={(e) => selectSchema(e.target.value)}>
                    <option value="">{c.schemaPlaceholder}</option>
                    {schemas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {level === "TABLE" && schemaId && (
                <div>
                  <label className="field-label">{c.tableLabel}</label>
                  <select className="input-field" value={tableId} onChange={(e) => setTableId(e.target.value)}>
                    <option value="">{c.tablePlaceholder}</option>
                    {tables.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          <div>
            <label className="field-label">{c.justificationLabel} <span className="text-muted font-normal normal-case">{c.justificationOptional}</span></label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              className="input-field resize-none"
              placeholder={c.justificationPlaceholder}
            />
          </div>

          {message && (
            <p className={`text-sm px-3 py-2 rounded-md border ${message.ok ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
              {message.text}
            </p>
          )}

          <div className="flex justify-end">
            <button onClick={submit} disabled={submitting} className="btn btn-primary">
              {submitting ? t.common.submitting : c.submitBtn}
            </button>
          </div>
        </div>
      )}

      {tab === "mine" && (
        mine.length === 0 ? (
          <p className="text-[13px] text-muted italic">{c.myRequestsEmpty}</p>
        ) : (
          <div className="space-y-2">
            {mine.map((row) => (
              <div key={row.requestId} className="card p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{describeRequest(row)}</div>
                  <div className="text-[11px] text-muted mt-0.5">{new Date(row.createdAt).toLocaleDateString()}</div>
                </div>
                <StatusTag status={row.statusCode} />
              </div>
            ))}
          </div>
        )
      )}

      {tab === "pending" && (
        pendingForMe.length === 0 ? (
          <p className="text-[13px] text-muted italic">{c.pendingApprovalEmpty}</p>
        ) : (
          <div className="space-y-2">
            {pendingForMe.map((row) => (
              <div key={row.requestId} className="card p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{describeRequest(row)}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {c.columnRequester}: {row.requesterName ?? row.requesterUserId} · {new Date(row.createdAt).toLocaleDateString()}
                  </div>
                  {row.justificationText && (
                    <div className="text-[12px] text-ink-soft mt-1 italic">"{row.justificationText}"</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => decide(row.requestId, "REJECTED")} className="btn text-red-600">{c.rejectBtn}</button>
                  <button onClick={() => decide(row.requestId, "APPROVED")} className="btn btn-primary">{c.approveBtn}</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
