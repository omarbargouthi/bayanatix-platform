"use client";

import { useState } from "react";
import type { FoiCaseDetail, FoiPayment } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = {
  caseData:   FoiCaseDetail;
  payments:   FoiPayment[];
  totalPaid:  number;
  currentUser: SessionUser;
  onChanged:  () => void;
};

const TYPE_LABELS: Record<string, string> = {
  FULFILLMENT_FEE:  "Fulfillment Fee",
  APPEAL_REVIEW_FEE:"Appeal Review Fee",
  REFUND:           "Refund",
};

export function PaymentsTab({ caseData, payments, totalPaid, currentUser: _user, onChanged }: Props) {
  const [showForm,  setShowForm]  = useState(false);
  const [amount,    setAmount]    = useState("");
  const [ref,       setRef]       = useState("");
  const [type,      setType]      = useState("FULFILLMENT_FEE");
  const [notes,     setNotes]     = useState("");
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const quotedAmount = caseData.quotedAmount ? Number(caseData.quotedAmount) : null;
  const isPaid       = quotedAmount !== null && totalPaid >= quotedAmount;
  const canRecord    = ["QUOTE_ACCEPTED","IN_FULFILLMENT","AWAITING_PAYMENT"].includes(caseData.statusCode);

  async function record() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt === 0) { setError("Enter a valid amount"); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/foi/${caseData.foiRequestId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, referenceText: ref || null, paymentTypeCode: type, notes: notes || null }),
      });
      const payload = await r.json();
      if (!r.ok) { setError(payload.error ?? "Failed"); return; }
      setShowForm(false); setAmount(""); setRef(""); setNotes("");
      onChanged();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Summary */}
      {quotedAmount !== null && (
        <div className="card p-5">
          <h2 className="font-semibold text-sm text-ink mb-4">Payment Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-canvas-soft rounded-lg">
              <div className="text-[10px] text-muted uppercase font-bold mb-1">Quoted</div>
              <div className="text-lg font-bold text-ink">SAR {quotedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="text-center p-3 bg-canvas-soft rounded-lg">
              <div className="text-[10px] text-muted uppercase font-bold mb-1">Received</div>
              <div className={`text-lg font-bold ${isPaid ? "text-green-600" : "text-amber-600"}`}>
                SAR {totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className={`text-center p-3 rounded-lg ${isPaid ? "bg-green-50 border border-green-100" : "bg-amber-50 border border-amber-100"}`}>
              <div className="text-[10px] text-muted uppercase font-bold mb-1">Balance</div>
              <div className={`text-lg font-bold ${isPaid ? "text-green-700" : "text-amber-700"}`}>
                {isPaid ? "Paid in full" : "SAR " + (quotedAmount - totalPaid).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add payment */}
      {canRecord && !showForm && (
        <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">+ Record Payment</button>
      )}

      {showForm && (
        <div className="card p-5 space-y-4 border-2 border-dashed border-brand-purple/30">
          <h2 className="font-semibold text-sm text-ink">Record Payment</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Amount (SAR) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" className="input w-full" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Type</label>
              <select className="input w-full" value={type} onChange={e => setType(e.target.value)}>
                <option value="FULFILLMENT_FEE">Fulfillment Fee</option>
                <option value="APPEAL_REVIEW_FEE">Appeal Review Fee</option>
                <option value="REFUND">Refund</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Payment Reference (SADAD / receipt)</label>
            <input className="input w-full" placeholder="Reference number from payment system" value={ref} onChange={e => setRef(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Notes</label>
            <input className="input w-full" placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn btn-sm">Cancel</button>
            <button onClick={record} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Recording…" : "Record Payment"}</button>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-2.5 border-b border-line bg-canvas-soft text-[10px] font-bold uppercase tracking-wider text-muted grid grid-cols-[120px_80px_160px_1fr_120px]">
          <div>Type</div>
          <div>Amount</div>
          <div>Reference</div>
          <div>Notes</div>
          <div>Received</div>
        </div>
        {payments.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">No payments recorded yet.</div>
        ) : payments.map(p => (
          <div key={p.paymentId} className="grid grid-cols-[120px_80px_160px_1fr_120px] px-5 py-3 border-b border-line-soft items-center">
            <div className={`text-[11px] font-semibold ${p.paymentTypeCode === 'REFUND' ? 'text-red-600' : 'text-green-700'}`}>
              {TYPE_LABELS[p.paymentTypeCode] ?? p.paymentTypeCode}
            </div>
            <div className={`text-sm font-bold ${p.paymentTypeCode === 'REFUND' ? 'text-red-600' : 'text-ink'}`}>
              {p.paymentTypeCode === 'REFUND' ? '-' : ''}SAR {Math.abs(Number(p.amount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] font-mono text-muted truncate">{p.paymentReferenceText ?? "—"}</div>
            <div className="text-[11px] text-muted truncate">{p.notesText ?? "—"}</div>
            <div className="text-[11px] text-muted">{new Date(p.receivedAt).toLocaleDateString("en-GB")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
