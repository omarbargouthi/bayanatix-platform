"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { AssetRequest } from "@/lib/types";
import type { WorkflowInstance } from "@/lib/queries/workflow";

const TYPE_LABEL: Record<string, string> = {
  FIX_DATA_ISSUE:    "Fix Data Issue",
  UPDATE_DEFINITION: "Update Definition",
  CERTIFY_ASSET:     "Certify Asset",
  GRANT_ACCESS:      "Grant Access",
  REMOVE_ACCESS:     "Remove Access",
  OTHER:             "Other",
};
const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   "text-red-600 bg-red-50 border-red-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW:    "text-gray-600 bg-gray-50 border-gray-200",
};
const STATUS_COLOR: Record<string, string> = {
  OPEN:        "text-blue-700 bg-blue-50",
  IN_PROGRESS: "text-amber-700 bg-amber-50",
  RESOLVED:    "text-emerald-700 bg-emerald-50",
  CLOSED:      "text-gray-500 bg-gray-50",
};
const OUTCOME_STYLE: Record<string, string> = {
  APPROVED:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  REJECTED:  "text-red-600 bg-red-50 border-red-200",
  COMPLETED: "text-blue-700 bg-blue-50 border-blue-200",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type WorkflowWithActor = WorkflowInstance & { isCurrentActor: boolean };

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [request,  setRequest]  = useState<AssetRequest | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowWithActor | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [notes,    setNotes]    = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, wRes] = await Promise.all([
        fetch(`/api/requests/${id}`),
        fetch(`/api/requests/${id}/workflow`),
      ]);
      if (rRes.ok) setRequest(await rRes.json());
      if (wRes.ok) {
        const wData = await wRes.json();
        setWorkflow(wData);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function advance(outcome: "APPROVED" | "REJECTED" | "COMPLETED") {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/requests/${id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes: notes.trim() || undefined }),
      });
      if (res.ok) { setNotes(""); setShowNotes(false); load(); }
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return <div className="py-20 text-center text-muted">Loading…</div>;
  if (!request) return (
    <div className="py-20 text-center text-muted">
      <p className="mb-4">Request not found.</p>
      <Link href="/requests" className="text-brand-purple hover:underline text-sm">← Back to requests</Link>
    </div>
  );

  const doneStageIds = new Set(
    (workflow?.history ?? []).filter((h) => h.completedAt).map((h) => h.stageId)
  );
  const currentOrder = workflow?.currentStageOrder ?? 0;

  return (
    <main className="px-8 py-7 pb-14 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/requests" className="text-sm text-muted hover:text-brand-purple flex items-center gap-1 mb-5">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        All Requests
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Request details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header card */}
          <div className="card p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${PRIORITY_COLOR[request.priorityCode] ?? ""}`}>
                {request.priorityCode}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[request.statusCode] ?? ""}`}>
                {request.statusCode.replace("_", " ")}
              </span>
              <span className="text-[11px] text-muted ml-auto">{timeAgo(request.createdAt)}</span>
            </div>
            <h1 className="text-xl font-extrabold text-brand-deep mb-1">{request.title}</h1>
            <div className="text-[12px] text-muted mb-4">
              {TYPE_LABEL[request.requestTypeCode] ?? request.requestTypeCode}
              {" · Raised by "}
              <span className="font-medium text-ink-soft">{request.raisedByName ?? request.raisedByUserId}</span>
            </div>
            {request.descriptionText && (
              <p className="text-sm text-ink leading-relaxed border-t border-line-soft pt-4">{request.descriptionText}</p>
            )}
          </div>

          {/* Targets */}
          {(request.targets ?? []).length > 0 && (
            <div className="card p-5">
              <h3 className="text-[11px] uppercase tracking-wider text-muted font-bold mb-3">Target Assets</h3>
              <div className="flex flex-wrap gap-2">
                {request.targets.map((t, i) => (
                  <span key={i} className="text-[12px] font-mono bg-canvas border border-line rounded px-2.5 py-1 text-ink">
                    {t.assetName ?? `${t.assetTypeCode}:${t.assetId ?? t.assetIdText}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stage action panel */}
          {workflow?.isCurrentActor && workflow.statusCode === "ACTIVE" && (
            <div className="card p-5 border-l-4 border-l-brand-purple">
              <div className="flex items-center gap-2 mb-3">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-purple" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h3 className="text-sm font-bold text-brand-deep">Your action is required</h3>
              </div>
              <p className="text-[12px] text-muted mb-4">
                You are assigned to stage <strong>{workflow.currentStageName}</strong>. Review the request and record your outcome below.
              </p>
              {showNotes && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional) — your comments will appear in the stage history"
                  className="w-full text-sm border border-line rounded-lg p-3 mb-3 focus:outline-none focus:border-brand-purple resize-none"
                  rows={3}
                />
              )}
              {!showNotes && (
                <button onClick={() => setShowNotes(true)} className="text-[12px] text-brand-purple hover:underline mb-3 block">
                  + Add notes
                </button>
              )}
              <div className="flex gap-2 flex-wrap">
                <button
                  disabled={advancing}
                  onClick={() => advance("APPROVED")}
                  className="btn btn-primary btn-sm"
                >
                  {advancing ? "…" : "✓ Approve & Advance"}
                </button>
                <button
                  disabled={advancing}
                  onClick={() => advance("COMPLETED")}
                  className="btn btn-sm"
                >
                  {advancing ? "…" : "Mark Complete"}
                </button>
                <button
                  disabled={advancing}
                  onClick={() => advance("REJECTED")}
                  className="btn btn-sm text-red-600 border-red-200 hover:bg-red-50"
                >
                  {advancing ? "…" : "✗ Reject"}
                </button>
              </div>
            </div>
          )}

          {/* Stage history timeline */}
          {(workflow?.history ?? []).length > 0 && (
            <div className="card p-5">
              <h3 className="text-[11px] uppercase tracking-wider text-muted font-bold mb-4">Stage History</h3>
              <div className="space-y-4">
                {workflow!.history.map((h, i) => (
                  <div key={h.historyId} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        h.completedAt
                          ? h.outcomeCode === "REJECTED" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"
                          : "bg-brand-purple/10 text-brand-purple ring-2 ring-brand-purple"
                      }`}>
                        {h.completedAt ? (h.outcomeCode === "REJECTED" ? "✗" : "✓") : h.stageOrder}
                      </div>
                      {i < workflow!.history.length - 1 && (
                        <div className="w-px flex-1 bg-line mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-semibold text-brand-deep">{h.stageName}</span>
                        {h.outcomeCode && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${OUTCOME_STYLE[h.outcomeCode] ?? ""}`}>
                            {h.outcomeCode}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted">
                        {h.assignedToName ? <>Assigned to <strong>{h.assignedToName}</strong> · </> : ""}
                        {timeAgo(h.enteredAt)}
                        {h.completedAt && h.completedByName && (
                          <> · Completed by <strong>{h.completedByName}</strong></>
                        )}
                      </div>
                      {h.notes && (
                        <p className="text-[12px] text-ink mt-1 bg-canvas rounded px-2 py-1">{h.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — Workflow progress */}
        <div className="space-y-4">
          {workflow ? (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-purple shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <div>
                  <div className="text-[13px] font-bold text-brand-deep">{workflow.workflowName}</div>
                  <div className={`text-[10px] font-semibold ${workflow.statusCode === "COMPLETED" ? "text-emerald-600" : "text-amber-600"}`}>
                    {workflow.statusCode}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-[10px] text-muted mb-1">
                  <span>Progress</span>
                  <span>{doneStageIds.size}/{workflow.totalStages} stages</span>
                </div>
                <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-purple rounded-full transition-all"
                    style={{ width: `${(doneStageIds.size / workflow.totalStages) * 100}%` }}
                  />
                </div>
              </div>

              {/* Stage dots */}
              <div className="space-y-2">
                {workflow.stages.map((s) => {
                  const done    = doneStageIds.has(s.stageId);
                  const current = s.stageId === workflow.currentStageId;
                  return (
                    <div key={s.stageId} className={`flex items-start gap-2.5 rounded-lg p-2 ${current ? "bg-brand-purple/5 ring-1 ring-brand-purple/20" : ""}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                        done    ? "bg-emerald-100 text-emerald-700" :
                        current ? "bg-brand-purple text-white" :
                                  "bg-canvas border border-line text-muted"
                      }`}>
                        {done ? "✓" : s.stageOrder}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[12px] font-semibold ${current ? "text-brand-purple" : done ? "text-muted line-through" : "text-ink"}`}>
                          {s.stageName}
                        </div>
                        <div className="text-[10px] text-muted">{s.assigneeLabel ?? s.assigneeType}</div>
                        {s.slaValue && !done && (
                          <div className="text-[10px] text-muted">SLA: {s.slaValue}d</div>
                        )}
                      </div>
                      {current && (
                        <span className="text-[9px] font-bold text-brand-purple bg-brand-purple/10 px-1.5 py-0.5 rounded-full shrink-0">NOW</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card p-5 text-center text-muted text-sm">
              No workflow assigned to this request type.
            </div>
          )}

          {/* Quick info */}
          <div className="card p-4 space-y-2 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted">Request ID</span>
              <span className="font-mono font-semibold text-ink">#{request.requestId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Created</span>
              <span className="text-ink">{timeAgo(request.createdAt)}</span>
            </div>
            {request.assignedToName && (
              <div className="flex justify-between">
                <span className="text-muted">Assigned to</span>
                <span className="text-ink font-medium">{request.assignedToName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
