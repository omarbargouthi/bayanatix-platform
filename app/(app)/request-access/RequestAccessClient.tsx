"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { NewRequestForm, type NewRequestResult } from "@/components/requests/NewRequestForm";
import { useLang } from "@/lib/lang-context";
import type { DomainCode } from "@/lib/can";
import type { AccessRequestRow, CatalogResourceType } from "@/lib/queries/access-requests";

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

  // ── New request (unified form) ──────────────────────────────────────────
  const [formKey, setFormKey] = useState(0);
  const [submitted, setSubmitted] = useState<NewRequestResult | null>(null);

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
    <div className="max-w-4xl">
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
        <div className="card p-5">
          {submitted && (
            <p className="text-sm px-3 py-2 mb-5 rounded-md border text-emerald-700 bg-emerald-50 border-emerald-200">
              {submitted.kind === "ACCESS" ? c.submitSuccess : c.assetRequestSubmitted}{" "}
              {submitted.kind === "ASSET" && (
                <Link href={submitted.requestId ? `/requests/${submitted.requestId}` : "/requests"} className="font-semibold underline">
                  {c.viewAssetRequests}
                </Link>
              )}
            </p>
          )}
          <NewRequestForm
            key={formKey}
            onSaved={async (result) => {
              setSubmitted(result);
              setFormKey((k) => k + 1);
              if (result.kind === "ACCESS") await loadRequests();
            }}
          />
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
