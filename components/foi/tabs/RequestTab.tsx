"use client";

import { useState, useEffect } from "react";
import type { FoiCaseDetail, RejectionGround } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

type Props = { caseData: FoiCaseDetail; currentUser: SessionUser; onChanged: () => void };

const EDITABLE_STATUSES = ["SUBMITTED", "TRIAGE", "CLARIFICATION_REQUESTED"];

export function RequestTab({ caseData, currentUser: _user, onChanged }: Props) {
  const { t } = useLang();
  const c = t.foi.request;
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
      if (!r.ok) { setError(payload.error ?? c.actionFailed); return; }
      setAction(null);
      onChanged();
    } catch {
      setError(c.networkErrorRetry);
    } finally {
      setBusy(false);
    }
  }

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{label}</span>
        <span className="text-sm text-ink" dir="auto">{value || <span className="italic text-muted">—</span>}</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Requester */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-ink">{c.requesterInfo}</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <InfoRow label={c.typeLabel}    value={caseData.requesterTypeCode} />
          <InfoRow label={c.nameLabel}    value={caseData.requesterName} />
          <InfoRow label={c.emailLabel}   value={caseData.requesterEmail} />
          <InfoRow label={c.phoneLabel}   value={caseData.requesterPhone} />
          <InfoRow label={c.idCrLabel} value={caseData.requesterNationalId} />
          <InfoRow label={c.languageLabel} value={caseData.requesterLanguage?.toUpperCase()} />
        </div>
      </div>

      {/* Request details */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-ink">{c.requestDetails}</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <InfoRow label={c.referenceLabel}   value={caseData.referenceCode} />
          <InfoRow label={c.channelLabel}     value={caseData.channelCode} />
          <InfoRow label={c.domainLabel}      value={caseData.domainName ?? caseData.domainCode} />
          <InfoRow label={c.formatLabel}      value={caseData.requestedFormatCode} />
          <InfoRow label={c.submittedLabel}   value={new Date(caseData.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} />
          <InfoRow label={c.slaDueLabel}     value={caseData.firstResponseDueDate ? new Date(caseData.firstResponseDueDate).toLocaleDateString("en-GB") : null} />
          <InfoRow label={c.assignedToLabel} value={caseData.assignedOfficerName} />
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{c.subjectLabel}</span>
          <p className="mt-1 text-sm text-ink" dir="auto">{caseData.subjectText}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{c.descriptionLabel}</span>
          <p className="mt-1 text-sm text-ink whitespace-pre-wrap" dir="auto">{caseData.descriptionText}</p>
        </div>
      </div>

      {/* Rejection details (if rejected) */}
      {caseData.statusCode === "REJECTED" && (
        <div className="card p-5 border-red-200 bg-red-50 space-y-3">
          <h2 className="font-semibold text-sm text-red-700">{c.rejectionTitle}</h2>
          <InfoRow label={c.groundLabel}        value={caseData.rejectionGroundName} />
          <InfoRow label={c.justificationLabel} value={caseData.rejectionJustificationText} />
        </div>
      )}

      {/* Delivery reference */}
      {(caseData.statusCode === "DELIVERED" || caseData.statusCode === "CLOSED") && caseData.deliveryReference && (
        <div className="card p-5 border-green-200 bg-green-50 space-y-2">
          <h2 className="font-semibold text-sm text-green-700">{c.deliveredTitle}</h2>
          <InfoRow label={c.deliveryRefLabel} value={caseData.deliveryReference} />
        </div>
      )}

      {/* Triage actions */}
      {isEditable && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-ink">{c.triageActions}</h2>

          {!action && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAction("PROCEED")} className="btn btn-primary btn-sm">
                {c.proceedToAssessment}
              </button>
              <button onClick={() => setAction("CLARIFY")} className="btn btn-sm border-amber-300 text-amber-700 hover:bg-amber-50">
                {c.requestClarification}
              </button>
              <button onClick={() => setAction("FREE")} className="btn btn-sm border-teal-300 text-teal-700 hover:bg-teal-50">
                {c.alreadyPublicAction}
              </button>
              <button onClick={() => setAction("REJECT")} className="btn btn-sm border-red-300 text-red-600 hover:bg-red-50">
                {c.rejectAction}
              </button>
              {caseData.statusCode === "CLARIFICATION_REQUESTED" && (
                <button onClick={() => doAction("RESUME_FROM_CLARIFICATION", {})} className="btn btn-sm border-purple-300 text-purple-700 hover:bg-purple-50">
                  {c.resumeFromClarification}
                </button>
              )}
            </div>
          )}

          {action === "PROCEED" && (
            <div className="space-y-3">
              <p className="text-sm text-muted">{c.moveToAssessmentDesc}</p>
              <div className="flex gap-2">
                <button onClick={() => doAction("PROCEED_TO_ASSESSMENT", {})} disabled={busy} className="btn btn-primary btn-sm">{busy ? c.moving : c.proceedToAssessment.replace(/^[✓]\s*/, "")}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">{c.cancelBtn}</button>
              </div>
            </div>
          )}

          {action === "CLARIFY" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.messageToRequester} <span className="text-red-500">*</span></label>
                <textarea
                  className="input w-full h-24 resize-none"
                  dir="auto"
                  placeholder={c.clarifyPlaceholder}
                  value={clarifyMessage}
                  onChange={e => setClarifyMessage(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("CLARIFY", { message: clarifyMessage, subject: "Clarification required for your FOI request" })}
                  disabled={busy || !clarifyMessage.trim()}
                  className="btn btn-primary btn-sm"
                >{busy ? c.sending : c.sendAndPauseSla}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">{c.cancelBtn}</button>
              </div>
            </div>
          )}

          {action === "FREE" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.publicLinkRef}</label>
                <input
                  className="input w-full"
                  dir="ltr"
                  placeholder={c.publicLinkPlaceholder}
                  value={publicLink}
                  onChange={e => setPublicLink(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("ANSWER_FREE", { publicLink, message: "The information you requested is publicly available." + (publicLink ? " You can access it here: " + publicLink : "") })}
                  disabled={busy}
                  className="btn btn-sm border-teal-300 text-teal-700"
                >{busy ? c.sending : c.answerAndClose}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">{c.cancelBtn}</button>
              </div>
            </div>
          )}

          {action === "REJECT" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.protectionGround} <span className="text-red-500">*</span></label>
                <select className="input w-full" value={groundCode} onChange={e => setGroundCode(e.target.value)}>
                  <option value="">{c.selectGround}</option>
                  {grounds.map(g => <option key={g.groundCode} value={g.groundCode}>{g.groundNameText}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.justificationLabel} <span className="text-red-500">*</span></label>
                <textarea
                  className="input w-full h-24 resize-none"
                  dir="auto"
                  placeholder={c.justificationPlaceholder}
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("REJECT", { groundCode, justification })}
                  disabled={busy || !groundCode || !justification.trim()}
                  className="btn btn-sm border-red-400 text-red-600"
                >{busy ? c.rejecting : c.rejectRequestBtn}</button>
                <button onClick={() => setAction(null)} className="btn btn-sm">{c.cancelBtn}</button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
