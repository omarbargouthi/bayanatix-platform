"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FoiCaseDetail, FoiComm, FoiPayment } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";
import { RequestTab }       from "./tabs/RequestTab";
import { AssessmentTab }    from "./tabs/AssessmentTab";
import { FulfillmentTab }   from "./tabs/FulfillmentTab";
import { PaymentsTab }      from "./tabs/PaymentsTab";
import { CommunicationsTab } from "./tabs/CommunicationsTab";

const UNDELETABLE_STATUSES = new Set(["IN_FULFILLMENT","DELIVERED","APPEAL_OPEN"]);

const TABS = [
  { key: "request",       label: "Request" },
  { key: "assessment",    label: "Assessment & Quote" },
  { key: "fulfillment",   label: "Fulfillment" },
  { key: "payments",      label: "Payments" },
  { key: "communications",label: "Communications" },
];

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:               "bg-blue-100 text-blue-700",
  TRIAGE:                  "bg-amber-100 text-amber-700",
  CLARIFICATION_REQUESTED: "bg-purple-100 text-purple-700",
  ASSESSMENT:              "bg-orange-100 text-orange-700",
  QUOTED:                  "bg-cyan-100 text-cyan-700",
  QUOTE_ACCEPTED:          "bg-teal-100 text-teal-700",
  IN_FULFILLMENT:          "bg-indigo-100 text-indigo-700",
  AWAITING_PAYMENT:        "bg-yellow-100 text-yellow-700",
  DELIVERED:               "bg-green-100 text-green-700",
  CLOSED:                  "bg-gray-100 text-gray-500",
  REJECTED:                "bg-red-100 text-red-600",
  APPEAL_OPEN:             "bg-red-100 text-red-700",
  APPEAL_DECIDED:          "bg-gray-100 text-gray-500",
  QUOTE_DECLINED:          "bg-gray-100 text-gray-500",
  WITHDRAWN:               "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted", TRIAGE: "In Triage",
  CLARIFICATION_REQUESTED: "Clarification Requested",
  ASSESSMENT: "Assessment", QUOTED: "Quoted",
  QUOTE_ACCEPTED: "Quote Accepted", IN_FULFILLMENT: "In Fulfillment",
  AWAITING_PAYMENT: "Awaiting Payment", DELIVERED: "Delivered",
  CLOSED: "Closed", REJECTED: "Rejected", APPEAL_OPEN: "Appeal Open",
  APPEAL_DECIDED: "Appeal Decided", QUOTE_DECLINED: "Quote Declined",
  WITHDRAWN: "Withdrawn",
};

type Props = { foiRequestId: number; currentUser: SessionUser };

export function CaseFile({ foiRequestId, currentUser }: Props) {
  const router = useRouter();
  const [activeTab,     setActiveTab]     = useState("request");
  const [loading,       setLoading]       = useState(true);
  const [caseData,      setCaseData]      = useState<FoiCaseDetail | null>(null);
  const [comms,         setComms]         = useState<FoiComm[]>([]);
  const [payments,      setPayments]      = useState<FoiPayment[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteErr,     setDeleteErr]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/foi/${foiRequestId}`);
      if (r.ok) {
        const data = await r.json();
        setCaseData(data.case);
        setComms(data.comms);
        setPayments(data.payments);
      }
    } finally {
      setLoading(false);
    }
  }, [foiRequestId]);

  useEffect(() => { load(); }, [load]);

  async function deleteFoi() {
    setDeleting(true); setDeleteErr(null);
    try {
      const r = await fetch(`/api/foi/${foiRequestId}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setDeleteErr(d.error ?? "Delete failed");
        return;
      }
      router.push("/foi");
    } finally { setDeleting(false); }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted text-sm">Loading case…</div>;
  }

  if (!caseData) {
    return <div className="flex-1 flex items-center justify-center text-muted text-sm">Case not found.</div>;
  }

  const totalPaid = payments
    .filter(p => p.paymentTypeCode === 'FULFILLMENT_FEE')
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-8 py-4 border-b border-line bg-white flex items-center gap-4 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm font-bold text-brand-purple">{caseData.referenceCode}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[caseData.statusCode] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABELS[caseData.statusCode] ?? caseData.statusCode}
            </span>
            {caseData.fulfillmentStageCode && (
              <span className="text-[10px] text-muted italic">{caseData.fulfillmentStageCode.replace(/_/g, ' ')}</span>
            )}
          </div>
          <div className="text-base font-semibold text-ink mt-0.5 truncate">{caseData.subjectText}</div>
        </div>

        {/* Delete button — only shown when request can safely be deleted */}
        {!UNDELETABLE_STATUSES.has(caseData.statusCode) && (
          <div className="shrink-0">
            {!deleteConfirm ? (
              <button onClick={() => { setDeleteConfirm(true); setDeleteErr(null); }}
                className="btn btn-sm text-[11px] text-red-500 border-red-200 hover:border-red-400 hover:bg-red-50">
                Delete Request
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <span className="text-[11px] text-red-700 font-medium">Delete {caseData.referenceCode}?</span>
                <button onClick={deleteFoi} disabled={deleting}
                  className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">
                  {deleting ? "…" : "Confirm"}
                </button>
                <button onClick={() => { setDeleteConfirm(false); setDeleteErr(null); }}
                  className="text-[11px] text-red-500 hover:text-red-700">Cancel</button>
              </div>
            )}
            {deleteErr && <p className="text-[10px] text-red-600 mt-1 text-right">{deleteErr}</p>}
          </div>
        )}

        {caseData.slaBusinessDaysLeft !== null && (
          <div className={`text-center px-3 py-1.5 rounded-lg ${
            (caseData.slaBusinessDaysLeft ?? 99) < 0 ? "bg-red-50 border border-red-100" :
            (caseData.slaBusinessDaysLeft ?? 99) <= 5 ? "bg-amber-50 border border-amber-100" :
            "bg-green-50 border border-green-100"
          }`}>
            <div className={`text-lg font-bold ${
              (caseData.slaBusinessDaysLeft ?? 99) < 0 ? "text-red-600" :
              (caseData.slaBusinessDaysLeft ?? 99) <= 5 ? "text-amber-700" : "text-green-700"
            }`}>
              {(caseData.slaBusinessDaysLeft ?? 0) < 0 ? "Overdue" : `${caseData.slaBusinessDaysLeft}d`}
            </div>
            <div className="text-[10px] text-muted">SLA remaining</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-8 border-b border-line bg-white shrink-0">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-brand-purple text-brand-purple"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
              {t.key === "communications" && comms.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-canvas text-muted px-1.5 py-0.5 rounded-full">{comms.length}</span>
              )}
              {t.key === "payments" && payments.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-canvas text-muted px-1.5 py-0.5 rounded-full">{payments.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === "request" && (
          <RequestTab caseData={caseData} currentUser={currentUser} onChanged={load} />
        )}
        {activeTab === "assessment" && (
          <AssessmentTab caseData={caseData} totalPaid={totalPaid} currentUser={currentUser} onChanged={load} />
        )}
        {activeTab === "fulfillment" && (
          <FulfillmentTab caseData={caseData} currentUser={currentUser} onChanged={load} />
        )}
        {activeTab === "payments" && (
          <PaymentsTab caseData={caseData} payments={payments} totalPaid={totalPaid} currentUser={currentUser} onChanged={load} />
        )}
        {activeTab === "communications" && (
          <CommunicationsTab foiRequestId={foiRequestId} comms={comms} currentUser={currentUser} onChanged={load} />
        )}
      </div>
    </div>
  );
}
