"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { AssetRequest, RequestStatus } from "@/lib/types";
import type { AccessRequestRow } from "@/lib/queries/access-requests";

const TYPE_LABEL: Record<string, string> = {
  FIX_DATA_ISSUE:    "Fix Data Issue",
  UPDATE_DEFINITION: "Update Definition",
  CERTIFY_ASSET:     "Certify Asset",
  GRANT_ACCESS:      "Grant Access",
  REMOVE_ACCESS:     "Remove Access",
  CLEANUP_DATA_ASSET: "Clean Up Data Asset",
  OTHER:             "Other",
};

const TYPE_COLOR: Record<string, string> = {
  FIX_DATA_ISSUE:    "bg-red-50    text-red-700    border-red-200",
  UPDATE_DEFINITION: "bg-blue-50   text-blue-700   border-blue-200",
  CERTIFY_ASSET:     "bg-amber-50  text-amber-700  border-amber-200",
  GRANT_ACCESS:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  REMOVE_ACCESS:     "bg-orange-50 text-orange-700  border-orange-200",
  CLEANUP_DATA_ASSET: "bg-rose-50 text-rose-700 border-rose-200",
  OTHER:             "bg-gray-50   text-gray-600   border-gray-200",
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH:   "bg-red-500",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-gray-300",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All Statuses"  },
  { value: "OPEN",        label: "Open"          },
  { value: "IN_PROGRESS", label: "In Progress"   },
  { value: "RESOLVED",    label: "Resolved"      },
  { value: "CLOSED",      label: "Closed"        },
];

// Access requests (a data source, schema, table or feature domain) live in their own
// table with their own statuses; they are listed here next to the asset requests.
type AccessItem = AccessRequestRow & { canDecide: boolean };
type Item =
  | { key: string; createdAt: string; asset: AssetRequest; access?: undefined }
  | { key: string; createdAt: string; access: AccessItem; asset?: undefined };

const ACCESS_TYPE_COLOR = "bg-emerald-50 text-emerald-700 border-emerald-200";
// The page's status filter, in access-request terms (nothing is ever "in progress").
const ACCESS_STATUS_FOR_FILTER: Record<string, string | null> = {
  OPEN: "PENDING", IN_PROGRESS: null, RESOLVED: "APPROVED", CLOSED: "REJECTED",
};
const ACCESS_LEVEL_LABEL: Record<string, string> = { DATA_SOURCE: "Data Source", SCHEMA: "Schema", TABLE: "Table" };

function accessTitle(a: AccessRequestRow): string {
  return a.requestKind === "DOMAIN"
    ? `Access to domain: ${(a.domainCode ?? "—").replace(/_/g, " ")}`
    : `Access to ${(ACCESS_LEVEL_LABEL[a.resourceType ?? ""] ?? "asset").toLowerCase()}: ${a.resourceName ?? a.resourceId ?? "—"}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RequestsPageContent() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const domainFilter  = searchParams.get("domain") ?? "";

  const [requests,  setRequests]  = useState<AssetRequest[]>([]);
  const [access,    setAccess]    = useState<AccessItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("");
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [updating,  setUpdating]  = useState<number | null>(null);
  const [deciding,  setDeciding]  = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter)       params.set("status", filter);
    if (domainFilter) params.set("domain", domainFilter);
    try {
      const [r, a] = await Promise.all([fetch(`/api/requests?${params.toString()}`), fetch("/api/access-requests")]);
      if (r.ok) setRequests(await r.json());
      if (a.ok) {
        // The caller's own access requests, plus the ones waiting on their approval
        // (an administrator gets all of them).
        const d: { mine: AccessRequestRow[]; pendingForMe: AccessRequestRow[]; all?: AccessRequestRow[] } = await a.json();
        const decidable = new Set(d.pendingForMe.map((x) => x.requestId));
        const byId = new Map<number, AccessRequestRow>();
        for (const x of [...(d.all ?? []), ...d.mine, ...d.pendingForMe]) byId.set(x.requestId, x);
        setAccess([...byId.values()].map((x) => ({ ...x, canDecide: decidable.has(x.requestId) })));
      }
    } finally {
      setLoading(false);
    }
  }, [filter, domainFilter]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: number, statusCode: RequestStatus) {
    setUpdating(id);
    await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusCode }),
    });
    setUpdating(null);
    load();
  }

  async function decideAccess(id: number, decision: "APPROVED" | "REJECTED") {
    setDeciding(id);
    await fetch(`/api/access-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setDeciding(null);
    load();
  }

  // The governance-domain filter is about asset request targets, so it leaves access requests out.
  const visibleAccess = domainFilter ? [] : access.filter((a) => !filter || a.statusCode === ACCESS_STATUS_FOR_FILTER[filter]);
  const assetItems  = (rows: AssetRequest[]): Item[] => rows.map((r) => ({ key: `asset-${r.requestId}`, createdAt: r.createdAt, asset: r }));
  const accessItems = (rows: AccessItem[]): Item[] => rows.map((a) => ({ key: `access-${a.requestId}`, createdAt: a.createdAt, access: a }));
  const newestFirst = (items: Item[]) => items.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
  const isOpen = (r: AssetRequest) => r.statusCode === "OPEN" || r.statusCode === "IN_PROGRESS";

  // An access request carries no priority of its own; it is listed as Medium, the default.
  const grouped = {
    HIGH:   assetItems(requests.filter((r) => r.priorityCode === "HIGH" && isOpen(r))),
    MEDIUM: newestFirst([
      ...assetItems(requests.filter((r) => r.priorityCode === "MEDIUM" && isOpen(r))),
      ...accessItems(visibleAccess.filter((a) => a.statusCode === "PENDING")),
    ]),
    LOW:    assetItems(requests.filter((r) => r.priorityCode === "LOW" && isOpen(r))),
    done:   newestFirst([
      ...assetItems(requests.filter((r) => r.statusCode === "RESOLVED" || r.statusCode === "CLOSED")),
      ...accessItems(visibleAccess.filter((a) => a.statusCode !== "PENDING")),
    ]),
  };
  const total = requests.length + visibleAccess.length;

  return (
    <main className="px-8 py-7 pb-14 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">Requests</h1>
          <p className="text-sm text-muted mt-0.5">Requests raised against data assets, and your access requests, in one place</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-purple"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Link href="/request-access" className="btn btn-primary btn-sm">+ New Request</Link>
        </div>
      </div>

      {/* Domain filter badge */}
      {domainFilter && (
        <div className="flex items-center gap-2 mb-5 p-3 bg-brand-deep/5 border border-brand-deep/10 rounded-lg">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-deep shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span className="text-sm text-brand-deep">
            Filtered by domain: <span className="font-bold">{domainFilter}</span>
          </span>
          <button
            onClick={() => router.push("/requests")}
            className="ml-auto text-xs text-muted hover:text-brand-purple underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-muted">Loading…</div>
      ) : total === 0 ? (
        <div className="py-20 text-center text-muted">
          <div className="text-5xl mb-4">✓</div>
          <p>{domainFilter ? `No open requests for domain ${domainFilter}.` : "No requests found."}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => {
            const rows = grouped[priority];
            if (rows.length === 0) return null;
            return (
              <div key={priority}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${PRIORITY_DOT[priority]}`} />
                  <h2 className="font-bold text-sm text-brand-deep">{priority} Priority</h2>
                  <span className="text-[11px] text-muted">({rows.length})</span>
                </div>
                <div className="card overflow-hidden">
                  {rows.map((item, idx) => item.access ? (
                    <div key={item.key} className={idx > 0 ? "border-t border-line-soft" : ""}>
                      <button
                        className="w-full text-left px-5 py-4 hover:bg-canvas-soft transition-colors flex items-start gap-3"
                        onClick={() => setExpanded((e) => e === item.key ? null : item.key)}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT.MEDIUM}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ACCESS_TYPE_COLOR}`}>Access</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">PENDING APPROVAL</span>
                          </div>
                          <div className="text-sm font-semibold text-brand-deep">{accessTitle(item.access)}</div>
                          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2">
                            <span>{item.access.requesterName ?? item.access.requesterUserId}</span>
                            <span>·</span>
                            <span>{timeAgo(item.access.createdAt)}</span>
                          </div>
                        </div>
                        <span className="text-muted shrink-0 mt-1">{expanded === item.key ? "▲" : "▼"}</span>
                      </button>
                      {expanded === item.key && (
                        <div className="border-t border-line-soft px-5 py-4 bg-canvas-soft/50 space-y-3">
                          <p className="text-[13px] text-ink leading-relaxed">
                            {item.access.justificationText || <span className="text-muted italic">No justification given.</span>}
                          </p>
                          {item.access.canDecide ? (
                            <div className="flex gap-2 pt-1">
                              <button disabled={deciding === item.access.requestId} onClick={() => decideAccess(item.access.requestId, "APPROVED")} className="btn btn-primary btn-sm">
                                {deciding === item.access.requestId ? "…" : "✓ Approve"}
                              </button>
                              <button disabled={deciding === item.access.requestId} onClick={() => decideAccess(item.access.requestId, "REJECTED")} className="btn btn-sm text-red-600">
                                {deciding === item.access.requestId ? "…" : "✗ Reject"}
                              </button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted">Waiting for the approver.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (() => { const req = item.asset; return (
                    <div key={item.key} className={idx > 0 ? "border-t border-line-soft" : ""}>
                      {/* Summary */}
                      <button
                        className="w-full text-left px-5 py-4 hover:bg-canvas-soft transition-colors flex items-start gap-3"
                        onClick={() => setExpanded((e) => e === item.key ? null : item.key)}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[req.priorityCode]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLOR[req.requestTypeCode] ?? ""}`}>
                              {TYPE_LABEL[req.requestTypeCode] ?? req.requestTypeCode}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              req.statusCode === "IN_PROGRESS" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                            }`}>
                              {req.statusCode.replace("_", " ")}
                            </span>
                          </div>
                          <Link href={`/requests/${req.requestId}`} className="text-sm font-semibold text-brand-deep hover:text-brand-purple hover:underline">
                            {req.title}
                          </Link>
                          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2">
                            <span>{req.raisedByName ?? req.raisedByUserId}</span>
                            <span>·</span>
                            <span>{timeAgo(req.createdAt)}</span>
                            <span>·</span>
                            <span>{req.targets.length} asset{req.targets.length !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <span className="text-muted shrink-0 mt-1">{expanded === item.key ? "▲" : "▼"}</span>
                      </button>

                      {/* Expanded */}
                      {expanded === item.key && (
                        <div className="border-t border-line-soft px-5 py-4 bg-canvas-soft/50 space-y-3">
                          {req.descriptionText && (
                            <p className="text-[13px] text-ink leading-relaxed">{req.descriptionText}</p>
                          )}

                          <div className="flex flex-wrap gap-1.5">
                            {req.targets.map((t, i) => (
                              <span key={i} className="text-[11px] font-mono bg-white border border-line rounded px-2 py-0.5">
                                {t.assetName ?? (t.assetIdText ? `${t.assetTypeCode}:${t.assetIdText}` : `${t.assetTypeCode}:${t.assetId}`)}
                              </span>
                            ))}
                          </div>

                          <div className="flex gap-2 pt-1">
                            {req.statusCode !== "IN_PROGRESS" && (
                              <button
                                disabled={updating === req.requestId}
                                onClick={() => updateStatus(req.requestId, "IN_PROGRESS")}
                                className="btn btn-sm"
                              >
                                {updating === req.requestId ? "…" : "→ In Progress"}
                              </button>
                            )}
                            <button
                              disabled={updating === req.requestId}
                              onClick={() => updateStatus(req.requestId, "RESOLVED")}
                              className="btn btn-sm"
                            >
                              {updating === req.requestId ? "…" : "✓ Resolve"}
                            </button>
                            <button
                              disabled={updating === req.requestId}
                              onClick={() => updateStatus(req.requestId, "CLOSED")}
                              className="btn btn-sm text-muted"
                            >
                              {updating === req.requestId ? "…" : "Close"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ); })())}
                </div>
              </div>
            );
          })}

          {/* Resolved/Closed section */}
          {grouped.done.length > 0 && (
            <div className="opacity-60">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <h2 className="font-bold text-sm text-brand-deep">Resolved / Closed</h2>
                <span className="text-[11px] text-muted">({grouped.done.length})</span>
              </div>
              <div className="card overflow-hidden">
                {grouped.done.map((item, idx) => item.access ? (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-5 py-3 ${idx > 0 ? "border-t border-line-soft" : ""}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${item.access.statusCode === "APPROVED" ? "bg-emerald-400" : "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-ink line-clamp-1">{accessTitle(item.access)}</p>
                      <p className="text-[11px] text-muted">Access · {item.access.requesterName ?? item.access.requesterUserId} · {timeAgo(item.access.createdAt)}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      item.access.statusCode === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                    }`}>
                      {item.access.statusCode}
                    </span>
                  </div>
                ) : (() => { const req = item.asset; return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-5 py-3 ${idx > 0 ? "border-t border-line-soft" : ""}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${req.statusCode === "RESOLVED" ? "bg-emerald-400" : "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-ink line-clamp-1">{req.title}</p>
                      <p className="text-[11px] text-muted">{TYPE_LABEL[req.requestTypeCode]} · {timeAgo(req.createdAt)}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      req.statusCode === "RESOLVED" ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                    }`}>
                      {req.statusCode}
                    </span>
                  </div>
                ); })())}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export function RequestsPageClient() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted">Loading…</div>}>
      <RequestsPageContent />
    </Suspense>
  );
}
