"use client";

import { useState, useEffect } from "react";
import type { FoiCaseDetail } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = { caseData: FoiCaseDetail; totalPaid: number; currentUser: SessionUser; onChanged: () => void };

type ReqAttr = { reqAttrId: number; name: string; description: string | null; formatHint: string | null };

const ELIGIBILITY_OPTS = [
  { value: "ELIGIBLE",       label: "Eligible — proceed with fulfillment" },
  { value: "ALREADY_PUBLIC", label: "Already Public — free answer with link" },
  { value: "PARTIAL",        label: "Partial — fulfillment with redactions" },
  { value: "PROTECTED",      label: "Protected — must reject" },
];

const COMPLEXITY_OPTS = [
  { value: "SIMPLE",  label: "Simple (≤ 2 days)" },
  { value: "MEDIUM",  label: "Medium (3–10 days)" },
  { value: "COMPLEX", label: "Complex (> 10 days)" },
];

function suggestDays(complexity: string, columns: number, sources: number): number {
  const base     = complexity === "SIMPLE" ? 1 : complexity === "COMPLEX" ? 7 : 3;
  const colAdder = Math.min(5, Math.floor(columns / 10) * 0.1);
  const srcAdder = Math.max(0, (sources - 1)) * 0.5;
  return Math.max(0.5, parseFloat((base + colAdder + srcAdder).toFixed(1)));
}

export function AssessmentTab({ caseData, totalPaid, currentUser: _user, onChanged }: Props) {
  const [dailyRate, setDailyRate] = useState<number>(2000);

  // Requested attributes (shown read-only for officer reference)
  const [reqAttrs,     setReqAttrs]     = useState<ReqAttr[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);

  // Assessment form
  const [eligibility,  setEligibility]  = useState(caseData.eligibilityCode  ?? "ELIGIBLE");
  const [complexity,   setComplexity]   = useState(caseData.complexityCode   ?? "MEDIUM");
  const [columns,      setColumns]      = useState<string>(String(caseData.estimatedColumns ?? ""));
  const [sources,      setSources]      = useState<string>(String(caseData.estimatedSources ?? ""));
  const [effortDays,   setEffortDays]   = useState<string>(String(caseData.estimatedEffortDays ?? ""));
  const [notes,        setNotes]        = useState(caseData.assessmentNotes ?? "");
  const [publicLink,   setPublicLink]   = useState(caseData.alreadyPublicLink ?? "");
  const [autoCalc,     setAutoCalc]     = useState(!caseData.assessmentId);
  const [savingAssess, setSavingAssess] = useState(false);
  const [assessError,  setAssessError]  = useState<string | null>(null);

  // Payment exemption
  const [paymentExempt,   setPaymentExempt]   = useState(caseData.paymentExempt ?? false);
  const [exemptionReason, setExemptionReason] = useState(caseData.exemptionReason ?? "");
  const [exemptEvidRef,   setExemptEvidRef]   = useState(caseData.exemptionEvidenceRef ?? "");

  // Quote form
  const [deliveryDays,     setDeliveryDays]     = useState<string>(String(caseData.estimatedDeliveryDays ?? ""));
  const [quoteNote,        setQuoteNote]        = useState("");
  const [manualOverride,   setManualOverride]   = useState(false);
  const [manualAmount,     setManualAmount]     = useState<string>("");
  const [adjustReason,     setAdjustReason]     = useState<string>("");
  const [issuingQuote,     setIssuingQuote]     = useState(false);
  const [quoteError,       setQuoteError]       = useState<string | null>(null);

  // Quote decision
  const [quoteBusy,   setQuoteBusy]   = useState(false);
  const [adjustBusy,  setAdjustBusy]  = useState(false);

  // Load requested attributes for officer reference
  useEffect(() => {
    setLoadingAttrs(true);
    fetch(`/api/foi/${caseData.foiRequestId}/attributes`)
      .then(r => r.ok ? r.json() : [])
      .then(setReqAttrs)
      .catch(() => {})
      .finally(() => setLoadingAttrs(false));
  }, [caseData.foiRequestId]);

  useEffect(() => {
    fetch("/api/foi/config")
      .then(r => r.ok ? r.json() : null)
      .then((d: { config?: Record<string, string> } | null) => {
        if (d?.config?.foi_daily_rate_sar) setDailyRate(Number(d.config.foi_daily_rate_sar));
      });
  }, []);

  useEffect(() => {
    if (!autoCalc) return;
    const c = parseInt(columns) || 0;
    const s = parseInt(sources) || 1;
    setEffortDays(String(suggestDays(complexity, c, s)));
  }, [complexity, columns, sources, autoCalc]);

  const days         = parseFloat(effortDays) || 0;
  const computedCost = eligibility === "ALREADY_PUBLIC" ? 0 : days * dailyRate;
  const effectiveCost = paymentExempt ? 0 : (manualOverride && manualAmount !== "" ? Number(manualAmount) : computedCost);

  const isAssessable = ["SUBMITTED","TRIAGE","CLARIFICATION_REQUESTED","ASSESSMENT","QUOTED"].includes(caseData.statusCode);
  const hasAssessment = !!caseData.assessmentId;
  const canIssueQuote = hasAssessment && caseData.statusCode === "ASSESSMENT" && (days > 0 || eligibility === "ALREADY_PUBLIC" || paymentExempt);
  const hasQuote = !!caseData.quoteId;

  const quotedAmt = caseData.quotedAmount ? Number(caseData.quotedAmount) : 0;
  const isPaid = paymentExempt || quotedAmt === 0 || totalPaid >= quotedAmt;
  const canStartFulfillment = hasQuote && caseData.quoteStatusCode === 'ACCEPTED'
    && (caseData.statusCode === 'QUOTE_ACCEPTED' || (caseData.statusCode === 'AWAITING_PAYMENT' && isPaid));

  async function saveAssessment() {
    setSavingAssess(true); setAssessError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eligibilityCode:      eligibility,
          complexityCode:       complexity,
          estimatedColumns:     parseInt(columns) || null,
          estimatedSources:     parseInt(sources) || null,
          estimatedEffortDays:  parseFloat(effortDays) || 0,
          notes,
          alreadyPublicLink:    publicLink || null,
          paymentExempt,
          exemptionReason:      exemptionReason || null,
          exemptionEvidenceRef: exemptEvidRef || null,
        }),
      });
      const payload = await r.json();
      if (!r.ok) { setAssessError(payload.error ?? "Save failed"); return; }
      onChanged();
    } catch {
      setAssessError("Network error");
    } finally { setSavingAssess(false); }
  }

  async function issueQuote() {
    if (manualOverride && !adjustReason.trim()) {
      setQuoteError("Justification is required when overriding the quote amount");
      return;
    }
    setIssuingQuote(true); setQuoteError(null);
    try {
      const body: Record<string, unknown> = {
        dailyRateOverride:     dailyRate,
        estimatedDeliveryDays: parseInt(deliveryDays) || Math.ceil(days * 2),
        note: quoteNote || null,
      };
      if (manualOverride && !paymentExempt) {
        body.manualAmountOverride = Number(manualAmount);
        body.adjustmentReason     = adjustReason.trim();
      }
      const r = await fetch(`/api/foi/${caseData.foiRequestId}/quote`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await r.json();
      if (!r.ok) { setQuoteError(payload.error ?? "Failed to issue quote"); return; }
      onChanged();
    } catch {
      setQuoteError("Network error");
    } finally { setIssuingQuote(false); }
  }

  async function decideQuote(decision: "ACCEPTED" | "DECLINED") {
    setQuoteBusy(true);
    try {
      await fetch(`/api/foi/${caseData.foiRequestId}/quote`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      onChanged();
    } finally { setQuoteBusy(false); }
  }

  async function decideAdjustment(approve: boolean) {
    setAdjustBusy(true);
    try {
      await fetch(`/api/foi/${caseData.foiRequestId}/quote`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: approve ? "APPROVE_ADJUSTMENT" : "REJECT_ADJUSTMENT" }),
      });
      onChanged();
    } finally { setAdjustBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-5">

      {/* ── Requested Attributes (read-only reference for officer) ── */}
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-ink">Requested Data Attributes</h2>
        <p className="text-xs text-muted">What the requester specified — use this to guide your assessment and source mapping.</p>
        {loadingAttrs ? (
          <p className="text-sm text-muted italic">Loading…</p>
        ) : reqAttrs.length === 0 ? (
          <p className="text-sm text-muted italic">No structured attributes were submitted — requester used free-text description only.</p>
        ) : (
          <div className="divide-y divide-line">
            {reqAttrs.map((a, i) => (
              <div key={a.reqAttrId} className="py-2.5 flex items-start gap-3">
                <span className="w-5 h-5 flex-shrink-0 bg-brand-purple/10 text-brand-purple text-[10px] font-bold rounded-full flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink">{a.name}</span>
                    {a.formatHint && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{a.formatHint}</span>
                    )}
                  </div>
                  {a.description && <p className="text-xs text-muted mt-0.5">{a.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Assessment form ── */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-ink">Assessment</h2>
          {hasAssessment && <span className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">Assessed</span>}
        </div>

        {!isAssessable && !hasAssessment && (
          <p className="text-sm text-muted italic">Assessment is done during Triage or Assessment status.</p>
        )}

        {(isAssessable || hasAssessment) && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Eligibility <span className="text-red-500">*</span></label>
                <select className="input w-full" disabled={!isAssessable} value={eligibility} onChange={e => setEligibility(e.target.value)}>
                  {ELIGIBILITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Complexity <span className="text-red-500">*</span></label>
                <select className="input w-full" disabled={!isAssessable} value={complexity} onChange={e => setComplexity(e.target.value)}>
                  {COMPLEXITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {eligibility === "ALREADY_PUBLIC" && (
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Public Link / Reference</label>
                <input className="input w-full" disabled={!isAssessable} placeholder="URL or document reference" value={publicLink} onChange={e => setPublicLink(e.target.value)} />
              </div>
            )}

            {eligibility !== "ALREADY_PUBLIC" && (
              <div className={`p-4 rounded-lg border space-y-4 ${paymentExempt ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-bold uppercase ${paymentExempt ? "text-amber-700" : "text-blue-700"}`}>
                    {paymentExempt ? "Exemption Applied — No Charges" : "Cost Calculator"}
                  </h3>
                  {isAssessable && !paymentExempt && (
                    <label className="flex items-center gap-1.5 text-[11px] text-blue-600 cursor-pointer">
                      <input type="checkbox" checked={autoCalc} onChange={e => setAutoCalc(e.target.checked)} className="accent-blue-600" />
                      Auto-suggest days
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase mb-1"># Columns</label>
                    <input type="number" min="0" className="input w-full input-sm" disabled={!isAssessable} value={columns} onChange={e => setColumns(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase mb-1"># Data Sources</label>
                    <input type="number" min="1" className="input w-full input-sm" disabled={!isAssessable} value={sources} onChange={e => setSources(e.target.value)} placeholder="1" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Effort Days <span className="text-red-500">*</span></label>
                    <input type="number" min="0.5" step="0.5" className="input w-full input-sm" disabled={!isAssessable || paymentExempt} value={effortDays}
                      onChange={e => { setAutoCalc(false); setEffortDays(e.target.value); }} placeholder="1" />
                  </div>
                </div>
                <div className={`flex items-center justify-between pt-1 border-t ${paymentExempt ? "border-amber-200" : "border-blue-100"}`}>
                  {paymentExempt ? (
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-800">SAR 0.00 — Payment exempted</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">The requester will be informed that no charges are required.</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-blue-700">
                        <span className="font-bold">{days} days</span> × SAR {dailyRate.toLocaleString()} / day
                      </div>
                      <div className="text-base font-bold text-blue-800">
                        SAR {computedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Assessment Notes</label>
              <textarea className="input w-full h-20 resize-none" disabled={!isAssessable}
                placeholder="Internal notes about eligibility, scope, complexity rationale…" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* Payment exemption */}
            {isAssessable && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={paymentExempt} onChange={e => { setPaymentExempt(e.target.checked); setManualOverride(false); }} className="accent-amber-600 w-4 h-4" />
                  <span className="text-sm font-semibold text-amber-800">Grant Payment Exemption (No Charges)</span>
                </label>
                {paymentExempt && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Exemption Reason <span className="text-red-500">*</span></label>
                      <input className="input w-full text-sm" placeholder="e.g. Academic research, Public interest, NGO partner…"
                        value={exemptionReason} onChange={e => setExemptionReason(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Supporting Evidence Reference</label>
                      <input className="input w-full text-sm" placeholder="e.g. Letter ref, accreditation number, URL…"
                        value={exemptEvidRef} onChange={e => setExemptEvidRef(e.target.value)} />
                    </div>
                    <p className="text-[11px] text-amber-700">The data owner will review and approve this exemption during the fulfillment workflow. The requester will be notified that no charges are required.</p>
                    {caseData.exemptionApproved === true  && <p className="text-[11px] text-green-700 font-semibold">✓ Exemption approved by owner</p>}
                    {caseData.exemptionApproved === false && <p className="text-[11px] text-red-600 font-semibold">✗ Exemption rejected — payment required</p>}
                  </>
                )}
              </div>
            )}

            {isAssessable && (
              <div className="flex items-center justify-between">
                {assessError && <p className="text-sm text-red-600">{assessError}</p>}
                <div className="ml-auto">
                  <button onClick={saveAssessment}
                    disabled={savingAssess || (!effortDays && eligibility !== "ALREADY_PUBLIC" && !paymentExempt)}
                    className="btn btn-primary btn-sm">
                    {savingAssess ? "Saving…" : hasAssessment ? "Update Assessment" : "Save Assessment"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Quote ── */}
      {(hasAssessment || hasQuote) && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-ink">Quote</h2>
            {hasQuote && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                caseData.quoteStatusCode === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                caseData.quoteStatusCode === 'DECLINED' ? 'bg-red-100 text-red-600' :
                caseData.quoteStatusCode === 'EXPIRED'  ? 'bg-gray-100 text-gray-500' :
                'bg-cyan-100 text-cyan-700'
              }`}>{caseData.quoteStatusCode}</span>
            )}
          </div>

          {/* Existing quote details */}
          {hasQuote && (
            <div className="space-y-3">
              {/* Exempt / zero-cost banner */}
              {quotedAmt === 0 && caseData.paymentExempt && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">Payment Exempt — No Charges</p>
                  <p className="text-xs text-amber-700 mt-0.5">The requester has been informed that no payment is required.</p>
                  {caseData.exemptionReason && <p className="text-xs text-amber-700 mt-0.5">Reason: {caseData.exemptionReason}</p>}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 p-4 bg-canvas-soft rounded-xl">
                <div>
                  <div className="text-[10px] text-muted uppercase font-bold">Quoted Amount</div>
                  <div className="text-lg font-bold text-ink">
                    {quotedAmt === 0 ? (
                      <span className="text-green-700">Free</span>
                    ) : (
                      `SAR ${quotedAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    )}
                  </div>
                  {caseData.adjustmentReason && (
                    <div className="text-[10px] text-amber-700 mt-0.5">Manually adjusted</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase font-bold">Daily Rate</div>
                  <div className="text-sm text-ink">SAR {Number(caseData.dailyRateSar).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase font-bold">Delivery Est.</div>
                  <div className="text-sm text-ink">{caseData.estimatedDeliveryDays} working days</div>
                </div>
              </div>

              {/* Manual adjustment review */}
              {caseData.adjustmentReason && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-800">Manual Amount Adjustment</p>
                  <p className="text-xs text-blue-700">Justification: {caseData.adjustmentReason}</p>
                  {caseData.adjustmentApproved === null && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-amber-700">Pending owner review</span>
                      <button onClick={() => decideAdjustment(true)} disabled={adjustBusy} className="btn btn-sm text-[11px] border-green-400 text-green-700">✓ Approve</button>
                      <button onClick={() => decideAdjustment(false)} disabled={adjustBusy} className="btn btn-sm text-[11px] border-red-300 text-red-600">✗ Reject</button>
                    </div>
                  )}
                  {caseData.adjustmentApproved === true  && <p className="text-[11px] text-green-700 font-semibold">✓ Adjustment approved by owner</p>}
                  {caseData.adjustmentApproved === false && <p className="text-[11px] text-red-600 font-semibold">✗ Adjustment rejected — reissue quote at standard rate</p>}
                </div>
              )}

              {caseData.quoteStatusCode === 'ISSUED' && (
                <div className="flex gap-2 items-center">
                  <p className="text-xs text-muted flex-1">Record requester decision (verbal / email / portal):</p>
                  <button onClick={() => decideQuote("ACCEPTED")} disabled={quoteBusy} className="btn btn-sm border-green-400 text-green-700">{quoteBusy ? "…" : "✓ Accepted"}</button>
                  <button onClick={() => decideQuote("DECLINED")} disabled={quoteBusy} className="btn btn-sm border-red-300 text-red-600">{quoteBusy ? "…" : "✗ Declined"}</button>
                </div>
              )}

              {caseData.statusCode === 'AWAITING_PAYMENT' && !isPaid && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <strong>Payment required:</strong> SAR {quotedAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })} must be received in full before fulfillment can start.
                  Received so far: SAR {totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}.
                  Record payments in the <strong>Payments</strong> tab.
                </div>
              )}

              {canStartFulfillment && (
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      const r = await fetch(`/api/foi/${caseData.foiRequestId}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "START_FULFILLMENT" }),
                      });
                      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? "Failed"); return; }
                      onChanged();
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    → Start Fulfillment
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Issue new quote */}
          {canIssueQuote && !hasQuote && (
            <div className="space-y-4">
              {paymentExempt ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">No-charge quote will be issued</p>
                  <p className="text-xs text-amber-700 mt-0.5">The requester will be notified that their request has been approved with no charges required.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <span className="text-sm text-blue-700">
                      Computed amount: <strong>SAR {computedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong>
                    </span>
                    {isAssessable && (
                      <label className="flex items-center gap-1.5 text-[11px] text-blue-600 cursor-pointer">
                        <input type="checkbox" checked={manualOverride} onChange={e => setManualOverride(e.target.checked)} className="accent-blue-600" />
                        Override amount
                      </label>
                    )}
                  </div>
                  {manualOverride && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                      <div>
                        <label className="block text-[10px] font-bold text-yellow-800 uppercase mb-1">Override Amount (SAR) <span className="text-red-500">*</span></label>
                        <input type="number" min="0" step="0.01" className="input w-full text-sm"
                          placeholder={String(computedCost)} value={manualAmount} onChange={e => setManualAmount(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-yellow-800 uppercase mb-1">Justification <span className="text-red-500">*</span></label>
                        <input className="input w-full text-sm" placeholder="Reason for amount override (required for owner review)"
                          value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
                      </div>
                      <p className="col-span-2 text-[11px] text-yellow-800">The override amount and justification will be flagged for owner review during the fulfillment workflow.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Estimated Delivery (working days)</label>
                  <input type="number" min="1" className="input w-full" value={deliveryDays}
                    onChange={e => setDeliveryDays(e.target.value)} placeholder={String(Math.ceil(days * 2))} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Note (optional)</label>
                  <input className="input w-full" value={quoteNote} onChange={e => setQuoteNote(e.target.value)} placeholder="Any scope caveat or comment…" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">
                  Final amount: <strong className={paymentExempt ? "text-amber-700" : "text-ink"}>
                    {paymentExempt ? "SAR 0.00 (Exempt)" : `SAR ${effectiveCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                  </strong>
                </span>
                {quoteError && <span className="text-sm text-red-600">{quoteError}</span>}
                <button onClick={issueQuote} disabled={issuingQuote} className="btn btn-primary btn-sm">
                  {issuingQuote ? "Issuing…" : "Issue Quote to Requester"}
                </button>
              </div>
            </div>
          )}

          {!canIssueQuote && !hasQuote && hasAssessment && (
            <p className="text-sm text-muted italic">Save the assessment above to enable quote generation.</p>
          )}
        </div>
      )}
    </div>
  );
}
