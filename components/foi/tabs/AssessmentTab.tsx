"use client";

import { useState, useEffect } from "react";
import type { FoiCaseDetail } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = { caseData: FoiCaseDetail; currentUser: SessionUser; onChanged: () => void };

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

// Suggests effort days based on inputs
function suggestDays(complexity: string, columns: number, sources: number): number {
  const base = complexity === "SIMPLE" ? 1 : complexity === "COMPLEX" ? 7 : 3;
  const colAdder = Math.min(5, Math.floor(columns / 10) * 0.1);
  const srcAdder = Math.max(0, (sources - 1)) * 0.5;
  return Math.max(0.5, parseFloat((base + colAdder + srcAdder).toFixed(1)));
}

export function AssessmentTab({ caseData, currentUser: _user, onChanged }: Props) {
  const [dailyRate, setDailyRate] = useState<number>(2000);

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

  // Quote form
  const [deliveryDays, setDeliveryDays] = useState<string>(String(caseData.estimatedDeliveryDays ?? ""));
  const [quoteNote,    setQuoteNote]    = useState("");
  const [issuingQuote, setIssuingQuote] = useState(false);
  const [quoteError,   setQuoteError]   = useState<string | null>(null);

  // Quote decision
  const [quoteBusy,    setQuoteBusy]    = useState(false);

  useEffect(() => {
    fetch("/api/foi/config")
      .then(r => r.ok ? r.json() : null)
      .then((d: { config?: Record<string, string> } | null) => {
        if (d?.config?.foi_daily_rate_sar) setDailyRate(Number(d.config.foi_daily_rate_sar));
      });
  }, []);

  // Auto-calculate effort when inputs change
  useEffect(() => {
    if (!autoCalc) return;
    const c = parseInt(columns) || 0;
    const s = parseInt(sources) || 1;
    setEffortDays(String(suggestDays(complexity, c, s)));
  }, [complexity, columns, sources, autoCalc]);

  const days = parseFloat(effortDays) || 0;
  const estimatedCost = eligibility === "ALREADY_PUBLIC" ? 0 : days * dailyRate;

  const isAssessable = ["SUBMITTED","TRIAGE","CLARIFICATION_REQUESTED","ASSESSMENT","QUOTED"].includes(caseData.statusCode);
  const hasAssessment = !!caseData.assessmentId;
  const canIssueQuote = hasAssessment && caseData.statusCode === "ASSESSMENT" && days > 0;
  const hasQuote = !!caseData.quoteId;

  async function saveAssessment() {
    setSavingAssess(true); setAssessError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eligibilityCode:    eligibility,
          complexityCode:     complexity,
          estimatedColumns:   parseInt(columns) || null,
          estimatedSources:   parseInt(sources) || null,
          estimatedEffortDays: parseFloat(effortDays),
          notes,
          alreadyPublicLink:  publicLink || null,
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
    setIssuingQuote(true); setQuoteError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyRateOverride:    dailyRate,
          estimatedDeliveryDays: parseInt(deliveryDays) || Math.ceil(days * 2),
          note: quoteNote || null,
        }),
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      onChanged();
    } finally { setQuoteBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Assessment form */}
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
              <>
                {/* Cost Calculator */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-blue-700 uppercase">Cost Calculator</h3>
                    {isAssessable && (
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
                      <input type="number" min="0.5" step="0.5" className="input w-full input-sm" disabled={!isAssessable} value={effortDays} onChange={e => { setAutoCalc(false); setEffortDays(e.target.value); }} placeholder="1" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-blue-100">
                    <div className="text-xs text-blue-700">
                      <span className="font-bold">{days} days</span> × SAR {dailyRate.toLocaleString()} / day
                    </div>
                    <div className="text-base font-bold text-blue-800">
                      SAR {estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Assessment Notes</label>
              <textarea className="input w-full h-20 resize-none" disabled={!isAssessable} placeholder="Internal notes about eligibility, scope, complexity rationale…" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {isAssessable && (
              <div className="flex items-center justify-between">
                {assessError && <p className="text-sm text-red-600">{assessError}</p>}
                <div className="ml-auto">
                  <button onClick={saveAssessment} disabled={savingAssess || !effortDays} className="btn btn-primary btn-sm">
                    {savingAssess ? "Saving…" : hasAssessment ? "Update Assessment" : "Save Assessment"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quote */}
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

          {hasQuote && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4 p-4 bg-canvas-soft rounded-lg">
                <div>
                  <div className="text-[10px] text-muted uppercase font-bold">Quoted Amount</div>
                  <div className="text-lg font-bold text-ink">SAR {Number(caseData.quotedAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
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
              {caseData.quoteStatusCode === 'ISSUED' && (
                <div className="flex gap-2">
                  <p className="text-xs text-muted flex-1">Record requester decision (verbal / email / portal):</p>
                  <button onClick={() => decideQuote("ACCEPTED")} disabled={quoteBusy} className="btn btn-sm border-green-400 text-green-700">{quoteBusy ? "…" : "✓ Accepted"}</button>
                  <button onClick={() => decideQuote("DECLINED")} disabled={quoteBusy} className="btn btn-sm border-red-300 text-red-600">{quoteBusy ? "…" : "✗ Declined"}</button>
                </div>
              )}
              {caseData.quoteStatusCode === 'ACCEPTED' && caseData.statusCode === 'QUOTE_ACCEPTED' && (
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      await fetch(`/api/foi/${caseData.foiRequestId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "START_FULFILLMENT" }),
                      });
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

          {canIssueQuote && !hasQuote && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Estimated Delivery (working days)</label>
                  <input type="number" min="1" className="input w-full" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} placeholder={String(Math.ceil(days * 2))} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Note (optional)</label>
                  <input className="input w-full" value={quoteNote} onChange={e => setQuoteNote(e.target.value)} placeholder="Any scope caveat or comment…" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                <span className="text-sm text-blue-700">Quote amount: <strong>SAR {estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
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
