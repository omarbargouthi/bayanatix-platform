"use client";

import { useState } from "react";
import type { FoiComm } from "@/lib/queries/foi";
import type { SessionUser } from "@/lib/types";

type Props = { foiRequestId: number; comms: FoiComm[]; currentUser: SessionUser; onChanged: () => void };

const TYPE_LABELS: Record<string, string> = {
  ACK:                  "Acknowledgment",
  CLARIFICATION_REQUEST:"Clarification Request",
  QUOTE:                "Quote",
  STATUS_UPDATE:        "Status Update",
  REJECTION:            "Rejection",
  APPEAL_DECISION:      "Appeal Decision",
  DELIVERY:             "Delivery",
  NOTE:                 "Internal Note",
};

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
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">+ Add Communication</button>
        )}
      </div>

      {showForm && (
        <div className="card p-5 space-y-4 border-2 border-dashed border-brand-purple/30">
          <h3 className="font-semibold text-sm text-ink">New Communication Entry</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Direction</label>
              <select className="input w-full" value={direction} onChange={e => setDirection(e.target.value)}>
                <option value="OUTBOUND">Outbound (to requester)</option>
                <option value="INBOUND">Inbound (from requester)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Type</label>
              <select className="input w-full" value={msgType} onChange={e => setMsgType(e.target.value)}>
                <option value="NOTE">Internal Note</option>
                <option value="STATUS_UPDATE">Status Update</option>
                <option value="CLARIFICATION_REQUEST">Clarification Request</option>
                <option value="ACK">Acknowledgment</option>
                <option value="REJECTION">Rejection</option>
                <option value="DELIVERY">Delivery</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Channel</label>
              <select className="input w-full" value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="EMAIL">Email</option>
                <option value="PORTAL">Portal</option>
                <option value="SMS">SMS</option>
                <option value="IN_PERSON">In Person</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Subject</label>
            <input className="input w-full" placeholder="Optional subject line" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Message / Notes <span className="text-red-500">*</span></label>
            <textarea className="input w-full h-24 resize-none" placeholder="Message body or internal note text…" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setBody(""); setSubject(""); }} className="btn btn-sm">Cancel</button>
            <button onClick={send} disabled={busy || !body.trim()} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Add Entry"}</button>
          </div>
        </div>
      )}

      {/* Communication timeline */}
      {comms.length === 0 ? (
        <div className="card p-8 text-center text-muted text-sm">No communications logged yet.</div>
      ) : (
        <div className="space-y-2">
          {comms.map(c => (
            <div key={c.commId} className={`card p-4 border-l-4 ${c.directionCode === 'INBOUND' ? 'border-l-purple-400' : c.messageTypeCode === 'NOTE' ? 'border-l-amber-300' : 'border-l-brand-purple'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[c.messageTypeCode] ?? "bg-gray-100 text-gray-600"}`}>
                      {TYPE_LABELS[c.messageTypeCode] ?? c.messageTypeCode}
                    </span>
                    <span className={`text-[10px] font-semibold ${c.directionCode === 'INBOUND' ? 'text-purple-600' : 'text-brand-purple'}`}>
                      {c.directionCode === 'INBOUND' ? '← Inbound' : '→ Outbound'}
                    </span>
                    <span className="text-[10px] text-muted">{c.channelCode}</span>
                    {c.senderName && <span className="text-[10px] text-muted">by {c.senderName}</span>}
                  </div>
                  {c.subjectText && <div className="text-sm font-medium text-ink mb-0.5">{c.subjectText}</div>}
                  <p className="text-sm text-ink-soft whitespace-pre-wrap">{c.bodyText}</p>
                </div>
                <div className="text-[11px] text-muted shrink-0 whitespace-nowrap">
                  {new Date(c.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  <br />
                  {new Date(c.sentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
