"use client";

import { useState, useEffect } from "react";
import type { FoiCaseDetail, RejectionGround } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = { caseData: FoiCaseDetail; currentUser: SessionUser; onChanged: () => void };

const EDITABLE_STATUSES = ["SUBMITTED", "TRIAGE", "CLARIFICATION_REQUESTED"];

export function RequestTab({ caseData, currentUser: _user, onChanged }: Props) {
  const [grounds,    setGrounds]   = useState<RejectionGround[]>([]);
  const [action,     setAction]    = useState<string | null>(null);
  const [busy,       setBusy]      = useState(false);
  const [error,      setError]     = useState<string | null>(null);

  // Triage action form state
  const [groundCode,     setGroundCode]     = useState("");
  const [justification,  setJustification]  = useState("");
  const [clarifyMessage, setClarifyMessage] = useState("");
  const [publicLink,     setPublicLink]     = useState("");

  useEffect(() => {
    fetch("/api/foi/config")
      .then(r => r.ok ? r.json() : { grounds: [] })
      .then(d => setGrounds(d.grounds ?? []));
  }, []);

  const isEditable = EDITABLE_STATUSES.includes(caseData.statusCode);

  async function doAction(act: string, body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act, ...body }),
      });
      const payload = await r.json();
      if (!r.ok) { setError(payload.error ?? "Action failed"); return; }
      setAction(null);
      onChanged();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{label}</span>
        <span className="text-sm text-ink">{value || <span className="italic text-muted">—</span>}</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Requester */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-ink">Requester Information</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <InfoRow label="Type"    value={caseData.requesterTypeCode} />
          <InfoRow label="Name"    value={caseData.requesterName} />
          <InfoRow label="Email"   value={caseData.requesterEmail} />
          <InfoRow label="Phone"   value={caseData.requesterPhone} />
          <InfoRow label="ID / CR" value={caseData.requesterNationalId} />
          <InfoRow label="Language" value={caseData.requesterLanguage?.toUpperCase()} />
        </div>
      </div>

      {/* Request details */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-ink">Request Details</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <InfoRow label="Reference"   value={caseData.referenceCode} />
          <InfoRow label="Channel"     value={caseData.channelCode} />
          <InfoRow label="Domain"      value={caseData.domainName ?? caseData.domainCode} />
          <InfoRow label="Format"      value={caseData.requestedFormatCode} />
          <InfoRow label="Submitted"   value={new Date(caseData.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} />
          <InfoRow label="SLA Due"     value={caseData.firstResponseDueDate ? new Date(caseData.firstResponseDueDate).toLocaleDateString("en-GB") : null} />
          <InfoRow label="Assigned to" value={caseData.assignedOfficerName} />
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Subject</span>
          <p className="mt-1 text-sm text-ink">{caseData.subjectText}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Description</span>
          <p className="mt-1 text-sm text-ink whitespace-pre-wrap">{caseData.descriptionText}</p>
        </div>
      </div>

      {/* Rejection details (if rejected) */}
      {caseData.statusCode === "REJECTED" && (
        <div className="card p-5 border-red-200 bg-red-50 space-y-3">
          <h2 className="font-semibold text-sm text-red-700">Rejection</h2>
          <InfoRow label="Ground"        value={caseData.rejectionGroundName} />
          <InfoRow label="Justification" value={caseData.rejectionJustificationText} />
        </div>
      )}

      {/* Delivery reference */}
      {(caseData.statusCode === "DELIVERED" || caseData.statusCode === "CLOSED") && caseData.deliveryReference && (
        <div className="card p-5 border-green-200 bg-green-50 space-y-2">
          <h2 className="font-semibold text-sm text-green-700">Delivered</h2>
          <InfoRow label="Delivery Reference" value={caseData.deliveryReference} />
        </div>
      )}

      {/* Triage actions */}
      {isEditable && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-ink">Triage Actions</h2>

          {!action && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAction("PROCEED")} className="btn btn-primary btn-sm">
                ✓ Proceed to Assessment
              </button>
              <button onClick={() => setAction("CLARIFY")} className="btn btn-sm border-amber-300 text-amber-700 hover:bg-amber-50">
                ? Request Clarification
              </button>
              <button onClick={() => setAction("FREE")} className="btn btn-sm border-teal-300 text-teal-700 hover:bg-teal-50">
                ✓ Already Public
              </button>
              <button onClick={() => setAction("REJECT")} className="btn btn-sm border-red-300 text-red-600 hover:bg-red-50">
                ✗ Reject
              </button>
              {caseData.statusCode === "CLARIFICATION_REQUESTED" && (
                <button onClick={() => doAction("RESUME_FROM_CLARIFICATION", {})} className="btn btn-sm border-purple-300 text-purple-700 hover:bg-purple-50">
                  ↺ Resume from Clarification
                </button>
              )}
            </div>
          )}

          {action === "PROCEED" && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Move this request to Assessment to evaluate eligibility and complexity.</p>
              <div className="flex gap-2">
                <button onClick={() => doAction("PROCEED_TO_ASSESSMENT", {})} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Moving…" : "Proceed to Assessment"}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {action === "CLARIFY" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Message to Requester <span className="text-red-500">*</span></label>
                <textarea
                  className="input w-full h-24 resize-none"
                  placeholder="Explain what additional information or clarification is needed…"
                  value={clarifyMessage}
                  onChange={e => setClarifyMessage(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("CLARIFY", { message: clarifyMessage, subject: "Clarification required for your FOI request" })}
                  disabled={busy || !clarifyMessage.trim()}
                  className="btn btn-primary btn-sm"
                >{busy ? "Sending…" : "Send & Pause SLA"}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {action === "FREE" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Public Link / Reference</label>
                <input
                  className="input w-full"
                  placeholder="https://…  or document reference"
                  value={publicLink}
                  onChange={e => setPublicLink(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("ANSWER_FREE", { publicLink, message: "The information you requested is publicly available." + (publicLink ? " You can access it here: " + publicLink : "") })}
                  disabled={busy}
                  className="btn btn-sm border-teal-300 text-teal-700"
                >{busy ? "Sending…" : "Answer & Close"}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {action === "REJECT" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Protection Ground <span className="text-red-500">*</span></label>
                <select className="input w-full" value={groundCode} onChange={e => setGroundCode(e.target.value)}>
                  <option value="">— Select ground —</option>
                  {grounds.map(g => <option key={g.groundCode} value={g.groundCode}>{g.groundNameText}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Justification <span className="text-red-500">*</span></label>
                <textarea
                  className="input w-full h-24 resize-none"
                  placeholder="Explain the specific reason for rejection under the selected ground…"
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("REJECT", { groundCode, justification })}
                  disabled={busy || !groundCode || !justification.trim()}
                  className="btn btn-sm border-red-400 text-red-600"
                >{busy ? "Rejecting…" : "Reject Request"}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
