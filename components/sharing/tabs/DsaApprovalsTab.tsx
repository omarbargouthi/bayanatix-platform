"use client";

import { useState } from "react";
import type { DsaApproval, DsaDetail } from "@/lib/queries/sharing";
import { STATUS_LABELS, STATUS_TO_STATION } from "@/lib/sharing-routing";

type Props = {
  dsaId:     number;
  approvals: DsaApproval[];
  dsa:       DsaDetail | null;
  onChanged: () => void;
};

const STATION_LABELS: Record<string,string> = {
  DATA_OWNER:    "Data Owner",
  DATA_PRIVACY:  "Data Privacy Officer",
  DMO_REVIEW:    "DMO Review",
  EXEC_DELEGATE: "Executive Delegate",
};

const DECISION_COLORS: Record<string,string> = {
  PENDING:  "bg-gray-100 text-gray-600",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  RETURNED: "bg-amber-100 text-amber-700",
};

export function DsaApprovalsTab({ dsaId, approvals, dsa, onChanged }: Props) {
  const [deciding, setDeciding]   = useState<number | null>(null);
  const [decision, setDecision]   = useState<"APPROVED"|"REJECTED"|"RETURNED">("APPROVED");
  const [comments, setComments]   = useState("");
  const [delegRef, setDelegRef]   = useState("");
  const [saving,   setSaving]     = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  const inApproval = dsa && !["DRAFT","RENEWAL_DRAFT","APPROVED","ACTIVE","SUSPENDED","TERMINATED","EXPIRED"].includes(dsa.statusCode);

  async function submitDecision(approvalId: number, stationCode: string) {
    if ((decision === "REJECTED" || decision === "RETURNED") && !comments.trim()) {
      alert("Comments are required for rejection or return.");
      return;
    }
    setSaving(true);
    setError(null);
    const r = await fetch(`/api/sharing/dsas/${dsaId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision, comments, delegationEvidenceRef: stationCode === "EXEC_DELEGATE" ? delegRef : undefined }),
    });
    setSaving(false);
    if (!r.ok) {
      const payload = await r.json().catch(() => ({}));
      setError(payload.error ?? "Failed to record decision");
      onChanged();
      return;
    }
    setDeciding(null);
    setComments("");
    setDelegRef("");
    onChanged();
  }

  if (!inApproval && approvals.length === 0) {
    return (
      <div className="max-w-3xl">
        <div className="card p-10 text-center text-muted text-sm">
          The approval cycle will appear here once the agreement is submitted for review.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Approval Progress</h2>
        <p className="text-xs text-muted mt-0.5">
          Stations execute sequentially. A rejection at any station returns the agreement to Draft.
          Current status: <span className="font-medium">{STATUS_LABELS[dsa?.statusCode ?? ""] ?? dsa?.statusCode}</span>
        </p>
      </div>

      {/* Timeline — stations execute sequentially: only the station matching the DSA's
          current status is actionable, matching the Open Data approval workflow. A
          non-required station's row can stay PENDING forever even after the workflow
          has moved past it, so this — not "first PENDING in order" — is the source of
          truth for which station is active. */}
      {(() => {
        const activeStation = dsa ? STATUS_TO_STATION[dsa.statusCode] : undefined;
        return (
      <div className="relative">
        {approvals.map((ap, idx) => {
          const isActive  = ap.decisionCode === "PENDING" && inApproval && ap.stationCode === activeStation;
          const isPast    = ap.decisionCode === "APPROVED";
          const isFuture  = ap.decisionCode === "PENDING" && ap.stationCode !== activeStation;

          return (
            <div key={ap.approvalId} className="flex gap-4">
              {/* Line */}
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  isPast    ? "border-green-500 bg-green-100 text-green-700" :
                  isActive  ? "border-brand-purple bg-brand-purple/10 text-brand-purple" :
                  ap.decisionCode === "REJECTED" ? "border-red-500 bg-red-100 text-red-700" :
                  ap.decisionCode === "RETURNED" ? "border-amber-500 bg-amber-100 text-amber-700" :
                  "border-gray-300 bg-gray-50 text-gray-400"
                }`}>
                  {isPast ? "✓" : ap.stationOrder}
                </div>
                {idx < approvals.length - 1 && (
                  <div className={`w-0.5 flex-1 my-1 ${isPast ? "bg-green-300" : "bg-gray-200"}`} style={{ minHeight: 24 }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-ink">{STATION_LABELS[ap.stationCode] ?? ap.stationCode}</span>
                  {!ap.requiredIndicator && <span className="text-[10px] text-muted">(optional)</span>}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DECISION_COLORS[ap.decisionCode] ?? "bg-gray-100 text-gray-500"}`}>
                    {ap.decisionCode}
                  </span>
                </div>

                {ap.approverName && (
                  <div className="text-[11px] text-muted mt-0.5">
                    {ap.approverName} {ap.decisionTimestamp && `· ${ap.decisionTimestamp.slice(0,10)}`}
                  </div>
                )}
                {ap.commentsText && (
                  <div className="mt-1 text-[12px] text-ink bg-canvas-soft px-3 py-2 rounded">{ap.commentsText}</div>
                )}

                {/* Decision form for the active pending station */}
                {isActive && deciding === ap.approvalId && (
                  <div className="mt-3 p-4 bg-white border border-brand-purple rounded-xl space-y-3">
                    <div className="flex gap-2">
                      {(["APPROVED","RETURNED","REJECTED"] as const).map(d => (
                        <button key={d}
                          onClick={() => setDecision(d)}
                          className={`px-3 py-1.5 rounded text-[12px] font-semibold border ${
                            decision === d
                              ? d === "APPROVED" ? "bg-green-100 border-green-500 text-green-700"
                              : d === "REJECTED" ? "bg-red-100 border-red-500 text-red-700"
                              : "bg-amber-100 border-amber-500 text-amber-700"
                              : "border-line text-muted"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="label">Comments {(decision !== "APPROVED") && <span className="text-red-500">*</span>}</label>
                      <textarea
                        className="input w-full h-16 resize-none"
                        placeholder={decision === "APPROVED" ? "Optional comments…" : "Required — explain the reason…"}
                        value={comments}
                        onChange={e => setComments(e.target.value)}
                      />
                    </div>
                    {ap.stationCode === "EXEC_DELEGATE" && decision === "APPROVED" && (
                      <div>
                        <label className="label">Delegation Instrument Reference *</label>
                        <input
                          className="input w-full"
                          placeholder="Reference to the delegation document"
                          value={delegRef}
                          onChange={e => setDelegRef(e.target.value)}
                        />
                      </div>
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2 justify-end">
                      <button className="btn" onClick={() => { setDeciding(null); setError(null); }}>Cancel</button>
                      <button
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => submitDecision(ap.approvalId, ap.stationCode)}
                      >
                        {saving ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}

                {isActive && deciding !== ap.approvalId && (
                  <button
                    onClick={() => setDeciding(ap.approvalId)}
                    className="mt-2 btn btn-primary btn-sm"
                  >
                    Record Decision
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
        );
      })()}

      {/* SLA note */}
      <div className="text-[11px] text-muted border-t border-line pt-3">
        Target SLAs: Request evaluation ≤ 30 days · Agreement execution ≤ 60 days · Appeals ≤ 14 days (NDMO Data Sharing Regulations)
      </div>
    </div>
  );
}
