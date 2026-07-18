"use client";

import { useState } from "react";
import type { FoiCaseDetail } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = { caseData: FoiCaseDetail; currentUser: SessionUser; onChanged: () => void };

const STAGES = [
  { code: "OWNER_IDENTIFICATION",   label: "Identify Data Owner",      role: "FOI Officer",        desc: "System proposes Data Owner(s) from the domain; officer confirms." },
  { code: "OWNER_SCOPE_REVIEW",     label: "Owner Scope Review",       role: "Data Owner",         desc: "Data Owner reviews request scope; approves, adjusts, or flags protected content." },
  { code: "STEWARD_COORDINATION",   label: "Steward Coordination",     role: "Business Steward",   desc: "Plans compilation, breaks into collection tasks, coordinates sources." },
  { code: "TECHNICAL_COMPILATION",  label: "Technical Compilation",    role: "Technical Steward",  desc: "Extracts/compiles data, applies redactions for PARTIAL eligibility." },
  { code: "OWNER_PACKAGE_APPROVAL", label: "Owner Package Approval",   role: "Data Owner",         desc: "Verifies compiled package matches approved scope; content sign-off." },
  { code: "DMO_RELEASE_APPROVAL",   label: "DMO Release Approval",     role: "DMO Head",           desc: "Compliance check; authorizes release. No delivery without this step." },
  { code: "PAYMENT_CONFIRMATION",   label: "Payment Confirmation",     role: "FOI Officer",        desc: "Verify fee received. System blocks delivery until payment confirmed." },
  { code: "DELIVERY",               label: "Delivery",                 role: "FOI Officer",        desc: "Send package in requested format; record delivery reference; close case." },
];

export function FulfillmentTab({ caseData, currentUser: _user, onChanged }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliveryRef, setDeliveryRef] = useState("");
  const [deliveryMsg, setDeliveryMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentStageIdx = STAGES.findIndex(s => s.code === caseData.fulfillmentStageCode);
  const isInFulfillment = ["IN_FULFILLMENT","AWAITING_PAYMENT"].includes(caseData.statusCode);
  const isAtDelivery    = caseData.fulfillmentStageCode === "DELIVERY";
  const isAtPayment     = caseData.fulfillmentStageCode === "PAYMENT_CONFIRMATION";

  async function advanceStage() {
    setAdvancing(true); setError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADVANCE_STAGE" }),
      });
      const p = await r.json();
      if (!r.ok) { setError(p.error); return; }
      onChanged();
    } catch { setError("Network error"); }
    finally { setAdvancing(false); }
  }

  async function deliver() {
    if (!deliveryRef.trim()) return;
    setDelivering(true); setError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELIVER", deliveryReference: deliveryRef.trim(), message: deliveryMsg || undefined }),
      });
      const p = await r.json();
      if (!r.ok) { setError(p.error); return; }
      onChanged();
    } catch { setError("Network error"); }
    finally { setDelivering(false); }
  }

  return (
    <div className="max-w-3xl space-y-5">
      {!caseData.fulfillmentStageCode && !isInFulfillment && (
        <div className="card p-8 text-center text-muted text-sm">
          Fulfillment starts after the requester accepts the quote and is initiated from the Assessment & Quote tab.
        </div>
      )}

      {(caseData.fulfillmentStageCode || isInFulfillment) && (
        <>
          {/* Stage timeline */}
          <div className="card p-5">
            <h2 className="font-semibold text-sm text-ink mb-4">Fulfillment Progress</h2>
            <div className="space-y-1">
              {STAGES.map((stage, idx) => {
                const done    = currentStageIdx > idx;
                const current = currentStageIdx === idx;
                const pending = currentStageIdx < idx;
                return (
                  <div key={stage.code} className="flex items-start gap-3 py-2">
                    <div className="shrink-0 flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                        done    ? "bg-green-500 border-green-500 text-white" :
                        current ? "bg-brand-purple border-brand-purple text-white" :
                        "bg-white border-line text-muted"
                      }`}>
                        {done ? "✓" : idx + 1}
                      </div>
                      {idx < STAGES.length - 1 && (
                        <div className={`w-0.5 h-5 mt-0.5 ${done ? "bg-green-500" : "bg-line"}`} />
                      )}
                    </div>
                    <div className={`flex-1 pb-1 ${pending ? "opacity-50" : ""}`}>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-sm font-medium ${current ? "text-brand-purple" : done ? "text-green-700" : "text-ink-soft"}`}>
                          {stage.label}
                        </span>
                        <span className="text-[10px] text-muted">{stage.role}</span>
                        {current && <span className="text-[10px] bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded-full font-semibold">Current</span>}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">{stage.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          {isInFulfillment && !isAtDelivery && !isAtPayment && (
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-sm text-ink">Stage Actions</h2>
              <p className="text-sm text-muted">Current stage: <strong>{STAGES[currentStageIdx]?.label ?? "—"}</strong> ({STAGES[currentStageIdx]?.role})</p>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>}
              <button onClick={advanceStage} disabled={advancing} className="btn btn-primary btn-sm">
                {advancing ? "Advancing…" : "Mark Stage Complete → Advance"}
              </button>
            </div>
          )}

          {/* Payment confirmation stage */}
          {isAtPayment && caseData.statusCode === "AWAITING_PAYMENT" && (
            <div className="card p-5 border-yellow-200 bg-yellow-50 space-y-3">
              <h2 className="font-semibold text-sm text-amber-800">Awaiting Payment</h2>
              <p className="text-sm text-amber-700">
                Record the payment in the <strong>Payments</strong> tab first, then advance to Delivery.
              </p>
              <button onClick={advanceStage} disabled={advancing} className="btn btn-sm border-amber-400 text-amber-700">
                {advancing ? "…" : "Confirm Payment Received → Advance to Delivery"}
              </button>
            </div>
          )}

          {/* Delivery stage */}
          {isAtDelivery && caseData.statusCode !== "DELIVERED" && (
            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-sm text-ink">Deliver Information</h2>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Delivery Reference <span className="text-red-500">*</span></label>
                <input className="input w-full" placeholder="SharePoint link, document number, email thread ID…" value={deliveryRef} onChange={e => setDeliveryRef(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Message to Requester</label>
                <textarea className="input w-full h-20 resize-none" placeholder="Cover note or delivery instructions…" value={deliveryMsg} onChange={e => setDeliveryMsg(e.target.value)} />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>}
              <button onClick={deliver} disabled={delivering || !deliveryRef.trim()} className="btn btn-primary btn-sm">
                {delivering ? "Delivering…" : "Confirm Delivery & Close Case"}
              </button>
            </div>
          )}

          {caseData.statusCode === "DELIVERED" && (
            <div className="card p-5 border-green-200 bg-green-50 space-y-2">
              <h2 className="font-semibold text-sm text-green-700">✓ Case Delivered & Closed</h2>
              <p className="text-sm text-muted">Delivery reference: <span className="font-mono text-ink">{caseData.deliveryReference}</span></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
