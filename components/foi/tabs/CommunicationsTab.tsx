"use client";

import { useState } from "react";
import type { FoiComm } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

type Props = { foiRequestId: number; comms: FoiComm[]; currentUser: SessionUser; onChanged: () => void };

const TYPE_COLORS: Record<string, string> = {
  ACK:                  "bg-blue-100 text-blue-700",
  CLARIFICATION_REQUEST:"bg-purple-100 text-purple-700",
  QUOTE:                "bg-cyan-100 text-cyan-700",
  STATUS_UPDATE:        "bg-gray-100 text-gray-600",
  REJECTION:            "bg-red-100 text-red-600",
  APPEAL_DECISION:      "bg-orange-100 text-orange-700",
  DELIVERY:             "bg-green-100 text-green-700",
  NOTE:                 "bg-amber-50 text-amber-700",
};

export function CommunicationsTab({ foiRequestId, comms, currentUser: _user, onChanged }: Props) {
  const { t } = useLang();
  const c = t.foi.communications;
  const TYPE_LABELS: Record<string, string> = {
    ACK: c.typeAck, CLARIFICATION_REQUEST: c.typeClarification, QUOTE: c.typeQuote,
    STATUS_UPDATE: c.typeStatusUpdate, REJECTION: c.typeRejection, APPEAL_DECISION: c.typeAppealDecision,
    DELIVERY: c.typeDelivery, NOTE: c.typeNote,
  };
  const [showForm,  setShowForm]  = useState(false);
  const [subject,   setSubject]   = useState("");
  const [body,      setBody]      = useState("");
  const [direction, setDirection] = useState("OUTBOUND");
  const [msgType,   setMsgType]   = useState("NOTE");
  const [channel,   setChannel]   = useState("EMAIL");
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function send() {
    if (!body.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/foi/${foiRequestId}/communicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directionCode:   direction,
          messageTypeCode: msgType,
          subjectText:     subject || null,
          bodyText:        body.trim(),
          channelCode:     channel,
        }),
      });
      const payload = await r.json();
      if (!r.ok) { setError(payload.error ?? "Failed"); return; }
      setShowForm(false); setSubject(""); setBody("");
      onChanged();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end">
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">{c.addCommunication}</button>
        )}
      </div>

      {showForm && (
        <div className="card p-5 space-y-4 border-2 border-dashed border-brand-purple/30">
          <h3 className="font-semibold text-sm text-ink">{c.newEntryTitle}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.directionLabel}</label>
              <select className="input w-full" value={direction} onChange={e => setDirection(e.target.value)}>
                <option value="OUTBOUND">{c.directionOutbound}</option>
                <option value="INBOUND">{c.directionInbound}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.typeLabel}</label>
              <select className="input w-full" value={msgType} onChange={e => setMsgType(e.target.value)}>
                <option value="NOTE">{c.typeNote}</option>
                <option value="STATUS_UPDATE">{c.typeStatusUpdate}</option>
                <option value="CLARIFICATION_REQUEST">{c.typeClarification}</option>
                <option value="ACK">{c.typeAck}</option>
                <option value="REJECTION">{c.typeRejection}</option>
                <option value="DELIVERY">{c.typeDelivery}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.channelLabel}</label>
              <select className="input w-full" value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="EMAIL">{c.channelEmail}</option>
                <option value="PORTAL">{c.channelPortal}</option>
                <option value="SMS">{c.channelSms}</option>
                <option value="IN_PERSON">{c.channelInPerson}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.subjectLabel}</label>
            <input className="input w-full" dir="auto" placeholder={c.subjectPlaceholder} value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{c.messageLabel} <span className="text-red-500">*</span></label>
            <textarea className="input w-full h-24 resize-none" dir="auto" placeholder={c.messagePlaceholder} value={body} onChange={e => setBody(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setBody(""); setSubject(""); }} className="btn btn-sm">{c.cancel}</button>
            <button onClick={send} disabled={busy || !body.trim()} className="btn btn-primary btn-sm">{busy ? c.saving : c.addEntry}</button>
          </div>
        </div>
      )}

      {/* Communication timeline */}
      {comms.length === 0 ? (
        <div className="card p-8 text-center text-muted text-sm">{c.noneLoggedYet}</div>
      ) : (
        <div className="space-y-2">
          {comms.map(cm => (
            <div key={cm.commId} className={`card p-4 border-l-4 ${cm.directionCode === 'INBOUND' ? 'border-l-purple-400' : cm.messageTypeCode === 'NOTE' ? 'border-l-amber-300' : 'border-l-brand-purple'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[cm.messageTypeCode] ?? "bg-gray-100 text-gray-600"}`}>
                      {TYPE_LABELS[cm.messageTypeCode] ?? cm.messageTypeCode}
                    </span>
                    <span className={`text-[10px] font-semibold ${cm.directionCode === 'INBOUND' ? 'text-purple-600' : 'text-brand-purple'}`}>
                      {cm.directionCode === 'INBOUND' ? c.inboundBadge : c.outboundBadge}
                    </span>
                    <span className="text-[10px] text-muted">{cm.channelCode}</span>
                    {cm.senderName && <span className="text-[10px] text-muted">{c.byPrefix.replace("{name}", cm.senderName)}</span>}
                  </div>
                  {cm.subjectText && <div className="text-sm font-medium text-ink mb-0.5" dir="auto">{cm.subjectText}</div>}
                  <p className="text-sm text-ink-soft whitespace-pre-wrap" dir="auto">{cm.bodyText}</p>
                </div>
                <div className="text-[11px] text-muted shrink-0 whitespace-nowrap">
                  {new Date(cm.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  <br />
                  {new Date(cm.sentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
