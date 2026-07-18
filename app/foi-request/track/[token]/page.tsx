"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import type { FoiTrackingView } from "@/lib/queries/foi";

const STATUS_INFO: Record<string, { label: string; desc: string; color: string; icon: string }> = {
  SUBMITTED:               { label: "Received",          desc: "Your request has been received and is awaiting triage.",                           color: "blue",   icon: "📥" },
  TRIAGE:                  { label: "Under Review",       desc: "An officer is reviewing your request for eligibility.",                           color: "amber",  icon: "🔍" },
  CLARIFICATION_REQUESTED: { label: "Clarification Needed",desc: "We need more information. Please check your email.",                             color: "purple", icon: "❓" },
  ASSESSMENT:              { label: "Assessment",         desc: "We are assessing the complexity and scope of your request.",                      color: "orange", icon: "📋" },
  QUOTED:                  { label: "Quote Ready",        desc: "A cost quote has been prepared. Please review and respond.",                      color: "cyan",   icon: "💰" },
  QUOTE_ACCEPTED:          { label: "Quote Accepted",     desc: "You accepted the quote. Fulfillment is being prepared.",                          color: "teal",   icon: "✅" },
  IN_FULFILLMENT:          { label: "In Progress",        desc: "Your request is being fulfilled by our team.",                                    color: "indigo", icon: "⚙️" },
  AWAITING_PAYMENT:        { label: "Awaiting Payment",   desc: "Your information is ready. Payment must be confirmed before delivery.",           color: "yellow", icon: "💳" },
  DELIVERED:               { label: "Delivered",          desc: "Your information has been delivered. The case is now closed.",                    color: "green",  icon: "📬" },
  REJECTED:                { label: "Rejected",           desc: "Your request has been rejected. See the reason below.",                           color: "red",    icon: "❌" },
  QUOTE_DECLINED:          { label: "Quote Declined",     desc: "You declined the quote. The case has been closed.",                               color: "gray",   icon: "🚫" },
  WITHDRAWN:               { label: "Withdrawn",          desc: "This request was withdrawn.",                                                     color: "gray",   icon: "↩️" },
  APPEAL_OPEN:             { label: "Appeal Under Review","desc": "Your appeal is being reviewed by the committee.",                               color: "orange", icon: "⚖️" },
  APPEAL_DECIDED:          { label: "Appeal Decided",     desc: "The committee has issued a decision on your appeal.",                             color: "gray",   icon: "📜" },
  CLOSED:                  { label: "Closed",             desc: "This case has been closed.",                                                      color: "gray",   icon: "🔒" },
};

const STATUS_ORDER = [
  "SUBMITTED","TRIAGE","ASSESSMENT","QUOTED","QUOTE_ACCEPTED","IN_FULFILLMENT","AWAITING_PAYMENT","DELIVERED",
];

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [data,    setData]    = useState<FoiTrackingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decided,  setDecided]  = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/foi/track/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error ?? "Not found")))
      .then(d => setData(d))
      .catch(e => setError(typeof e === "string" ? e : "Unable to load request status"))
      .finally(() => setLoading(false));
  }, [token]);

  async function decide(decision: "ACCEPTED" | "DECLINED") {
    setDeciding(true);
    try {
      const r = await fetch(`/api/foi/track/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await r.json();
      if (!r.ok) { setError(payload.error ?? "Decision failed"); return; }
      setDecided(decision);
      const updated = await fetch(`/api/foi/track/${token}`).then(r => r.json());
      setData(updated);
    } catch { setError("Network error"); }
    finally { setDeciding(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading request status…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 max-w-md text-center">
          <div className="text-3xl mb-3">🔍</div>
          <h2 className="font-bold text-gray-900 mb-2">Request Not Found</h2>
          <p className="text-sm text-gray-500">{error ?? "The tracking link may be invalid or expired."}</p>
          <a href="/foi-request" className="mt-4 inline-block btn btn-primary btn-sm">Submit a New Request</a>
        </div>
      </div>
    );
  }

  const info = STATUS_INFO[data.statusCode] ?? { label: data.statusCode, desc: "", color: "gray", icon: "📄" };
  const currentIdx = STATUS_ORDER.indexOf(data.statusCode);
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700", amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700", orange: "bg-orange-100 text-orange-700",
    cyan: "bg-cyan-100 text-cyan-700", teal: "bg-teal-100 text-teal-700",
    indigo: "bg-indigo-100 text-indigo-700", yellow: "bg-yellow-100 text-yellow-700",
    green: "bg-green-100 text-green-700", red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-lg font-bold text-gray-700">Freedom of Information — Request Status</h1>
        </div>

        {/* Status card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">{info.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-bold text-brand-purple">{data.referenceCode}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorMap[info.color]}`}>{info.label}</span>
              </div>
              <div className="font-semibold text-gray-900 text-base">{data.subjectText}</div>
              <p className="text-sm text-gray-500 mt-1">{info.desc}</p>
            </div>
          </div>

          {/* Progress bar for active requests */}
          {currentIdx >= 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-0.5">
                {STATUS_ORDER.map((s, i) => (
                  <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= currentIdx ? "bg-brand-purple" : "bg-gray-200"}`} />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                <span>Submitted</span>
                <span>Delivered</span>
              </div>
            </div>
          )}
        </div>

        {/* SLA due date */}
        {data.firstResponseDueDate && !["DELIVERED","CLOSED","REJECTED","QUOTE_DECLINED","WITHDRAWN"].includes(data.statusCode) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">First response due by</span>
            <span className="text-sm font-semibold text-gray-800">{new Date(data.firstResponseDueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</span>
          </div>
        )}

        {/* Quote accept/decline */}
        {data.statusCode === "QUOTED" && data.quoteId && data.quoteStatusCode === "ISSUED" && !decided && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold text-cyan-800">Quote for Your Request</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Total Cost</div>
                <div className="text-2xl font-bold text-gray-900">SAR {Number(data.quotedAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white rounded-xl p-4 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Estimated Delivery</div>
                <div className="text-2xl font-bold text-gray-900">{data.estimatedDeliveryDays}</div>
                <div className="text-xs text-gray-500">working days</div>
              </div>
            </div>
            <p className="text-xs text-cyan-700">Valid until: {data.validUntilDate ? new Date(data.validUntilDate).toLocaleDateString("en-GB") : "30 days"}</p>
            <div className="flex gap-3">
              <button
                onClick={() => decide("ACCEPTED")}
                disabled={deciding}
                className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
              >
                {deciding ? "…" : "✓ Accept Quote"}
              </button>
              <button
                onClick={() => decide("DECLINED")}
                disabled={deciding}
                className="flex-1 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-sm transition-colors"
              >
                {deciding ? "…" : "✗ Decline"}
              </button>
            </div>
          </div>
        )}

        {decided && (
          <div className={`rounded-xl p-5 text-sm font-medium ${decided === 'ACCEPTED' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
            {decided === "ACCEPTED" ? "✓ You accepted the quote. Our team will begin fulfillment." : "You declined the quote. The case has been closed."}
          </div>
        )}

        {/* Rejection details */}
        {data.statusCode === "REJECTED" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-3">
            <h3 className="font-semibold text-red-800">Request Rejected</h3>
            {data.rejectionGroundName && (
              <div>
                <div className="text-xs text-red-600 font-bold uppercase mb-1">Ground</div>
                <p className="text-sm text-red-800">{data.rejectionGroundName}</p>
              </div>
            )}
            {data.rejectionJustification && (
              <div>
                <div className="text-xs text-red-600 font-bold uppercase mb-1">Justification</div>
                <p className="text-sm text-red-800">{data.rejectionJustification}</p>
              </div>
            )}
            <p className="text-xs text-red-600">You may appeal this decision within 10 working days.</p>
          </div>
        )}

        {/* Delivery */}
        {data.statusCode === "DELIVERED" && data.deliveryReference && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-2">
            <h3 className="font-semibold text-green-800">✓ Your Information Has Been Delivered</h3>
            <div className="text-xs text-green-700 font-bold uppercase mb-1">Delivery Reference</div>
            <p className="text-sm font-mono text-green-800">{data.deliveryReference}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Save this page URL to track your request. Reference: {data.referenceCode}
        </p>
      </div>
    </div>
  );
}
