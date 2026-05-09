"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssetRequest, RequestStatus } from "@/lib/types";
import { RaiseRequestModal } from "./RaiseRequestModal";

const TYPE_LABEL: Record<string, string> = {
  FIX_DATA_ISSUE:    "Fix Data Issue",
  UPDATE_DEFINITION: "Update Definition",
  CERTIFY_ASSET:     "Certify Asset",
  GRANT_ACCESS:      "Grant Access",
  REMOVE_ACCESS:     "Remove Access",
  OTHER:             "Other",
};

const TYPE_COLOR: Record<string, string> = {
  FIX_DATA_ISSUE:    "bg-red-50    text-red-700    border-red-200",
  UPDATE_DEFINITION: "bg-blue-50   text-blue-700   border-blue-200",
  CERTIFY_ASSET:     "bg-amber-50  text-amber-700  border-amber-200",
  GRANT_ACCESS:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  REMOVE_ACCESS:     "bg-orange-50 text-orange-700  border-orange-200",
  OTHER:             "bg-gray-50   text-gray-600   border-gray-200",
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   "bg-red-500",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-gray-300",
};

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "OPEN",        label: "Open"        },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED",    label: "Resolved"    },
  { value: "CLOSED",      label: "Closed"      },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AssetRequestsDrawer({
  assetType,
  assetId,
  assetName,
  entities,
  onClose,
}: {
  assetType: string;
  assetId:   number;
  assetName: string;
  entities?: { entityId: number; entityName: string }[];
  onClose:   () => void;
}) {
  const [requests,      setRequests]      = useState<AssetRequest[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [updatingId,    setUpdatingId]    = useState<number | null>(null);
  const [showNewModal,  setShowNewModal]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/assets/${assetType}/${assetId}/requests`);
      if (r.ok) setRequests(await r.json());
    } finally {
      setLoading(false);
    }
  }, [assetType, assetId]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(requestId: number, statusCode: RequestStatus) {
    setUpdatingId(requestId);
    await fetch(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusCode }),
    });
    setUpdatingId(null);
    load();
  }

  const open   = requests.filter((r) => r.statusCode === "OPEN" || r.statusCode === "IN_PROGRESS");
  const closed = requests.filter((r) => r.statusCode === "RESOLVED" || r.statusCode === "CLOSED");

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-[480px] bg-white border-l border-line shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-start justify-between">
          <div>
            <h2 className="font-bold text-brand-deep text-base">Asset Requests</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5">{assetName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewModal(true)}
              className="btn btn-primary btn-sm text-[12px]"
            >
              + New Request
            </button>
            <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded hover:bg-canvas text-muted hover:text-ink text-xl">
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto nice-scroll">
          {loading ? (
            <div className="py-16 text-center text-muted text-sm">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-muted text-sm">No open requests for this asset.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-4 btn btn-primary btn-sm"
              >
                Raise a Request
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Open / In-progress */}
              {open.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted font-bold mb-2 px-1">
                    Open · {open.length}
                  </p>
                  <div className="space-y-2">
                    {open.map((req) => (
                      <RequestCard
                        key={req.requestId}
                        req={req}
                        expanded={expandedId === req.requestId}
                        updating={updatingId === req.requestId}
                        onToggle={() => setExpandedId((id) => id === req.requestId ? null : req.requestId)}
                        onUpdateStatus={(s) => updateStatus(req.requestId, s)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Resolved / Closed */}
              {closed.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted font-bold mb-2 px-1">
                    Resolved · {closed.length}
                  </p>
                  <div className="space-y-2 opacity-60">
                    {closed.map((req) => (
                      <RequestCard
                        key={req.requestId}
                        req={req}
                        expanded={expandedId === req.requestId}
                        updating={updatingId === req.requestId}
                        onToggle={() => setExpandedId((id) => id === req.requestId ? null : req.requestId)}
                        onUpdateStatus={(s) => updateStatus(req.requestId, s)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {showNewModal && (
        <RaiseRequestModal
          prefilledTarget={{ assetTypeCode: assetType, assetId, assetName }}
          entities={entities}
          onClose={() => setShowNewModal(false)}
          onSaved={() => { setShowNewModal(false); load(); }}
        />
      )}
    </>
  );
}

function RequestCard({
  req, expanded, updating, onToggle, onUpdateStatus,
}: {
  req:            AssetRequest;
  expanded:       boolean;
  updating:       boolean;
  onToggle:       () => void;
  onUpdateStatus: (s: RequestStatus) => void;
}) {
  return (
    <div className="border border-line rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-canvas-soft transition-colors"
        onClick={onToggle}
      >
        {/* Priority dot */}
        <span
          className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_COLOR[req.priorityCode] ?? "bg-gray-300"}`}
          title={`${req.priorityCode} priority`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLOR[req.requestTypeCode] ?? ""}`}>
              {TYPE_LABEL[req.requestTypeCode] ?? req.requestTypeCode}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              req.statusCode === "OPEN"        ? "bg-blue-50 text-blue-700"    :
              req.statusCode === "IN_PROGRESS" ? "bg-amber-50 text-amber-700" :
              req.statusCode === "RESOLVED"    ? "bg-emerald-50 text-emerald-700" :
              "bg-gray-50 text-gray-500"
            }`}>
              {req.statusCode.replace("_", " ")}
            </span>
          </div>
          <p className="text-sm font-semibold text-brand-deep line-clamp-1">{req.title}</p>
          <p className="text-[11px] text-muted mt-0.5">
            {req.raisedByName ?? req.raisedByUserId} · {timeAgo(req.createdAt)}
          </p>
        </div>
        <span className="text-muted text-[12px] shrink-0 mt-1">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-line px-4 py-3 bg-canvas-soft/50 space-y-3">
          {req.descriptionText && (
            <p className="text-[13px] text-ink leading-relaxed">{req.descriptionText}</p>
          )}

          {/* Other assets in this request */}
          {(req.targets ?? []).length > 1 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted font-bold mb-1">Also targets</p>
              <div className="flex flex-wrap gap-1">
                {req.targets.map((t, i) => (
                  <span key={i} className="text-[11px] bg-canvas border border-line rounded px-1.5 py-0.5 font-mono">
                    {t.assetName ?? (t.assetIdText ? `${t.assetTypeCode}:${t.assetIdText}` : `${t.assetTypeCode}:${t.assetId}`)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {req.resolutionNotes && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted font-bold mb-1">Resolution Notes</p>
              <p className="text-[12px] text-ink">{req.resolutionNotes}</p>
            </div>
          )}

          {/* Status update */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted font-bold mb-1.5">Update Status</p>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.filter((o) => o.value !== req.statusCode).map((o) => (
                <button
                  key={o.value}
                  disabled={updating}
                  onClick={() => onUpdateStatus(o.value)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-line hover:border-brand-purple hover:text-brand-purple transition-colors"
                >
                  {updating ? "…" : `→ ${o.label}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
