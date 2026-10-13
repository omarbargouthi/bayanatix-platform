"use client";

import { useState } from "react";
import type { CommEvent } from "@/lib/queries/gov-comm-events";
import { COMM_EVENT_TYPES, COMM_EVENT_STATUSES } from "@/lib/gov-framework-sections";
import { FormDialog, FormField } from "@/components/ui/FormDialog";
import { fmtGovDate } from "./GovAnnouncements";
import { useLang } from "@/lib/lang-context";

// Governance Framework › Communication Plan: the schedule of training and awareness
// sessions, updates on a policy, procedure, strategy or roadmap, key events and
// announcements. Planned events with "Show on the dashboard" are advertised there.

type EventForm = {
  title: string; description: string; typeCode: string; eventDate: string; endDate: string; timeText: string;
  location: string; audience: string; channel: string; statusCode: string; announce: boolean;
};
const EMPTY: EventForm = {
  title: "", description: "", typeCode: "TRAINING", eventDate: "", endDate: "", timeText: "",
  location: "", audience: "", channel: "", statusCode: "PLANNED", announce: true,
};

const STATUS_STYLE: Record<string, string> = {
  PLANNED:   "bg-blue-50 text-blue-700",
  DONE:      "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const today = () => new Date().toISOString().slice(0, 10);

export function CommunicationPlanClient({ initialEvents, canManage }: { initialEvents: CommEvent[]; canManage: boolean }) {
  const { t, lang } = useLang();
  const c = t.commPlan;
  const types = c.types as Record<string, string>;
  const statuses = c.statuses as Record<string, string>;

  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState<EventForm | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPast, setShowPast] = useState(false);

  // Upcoming: still planned and not over yet. Everything else is the record of what happened.
  const now = today();
  const isUpcoming = (e: CommEvent) => e.statusCode === "PLANNED" && (e.endDate ?? e.eventDate) >= now;
  const upcoming = events.filter(isUpcoming);
  const past = events.filter((e) => !isUpcoming(e)).reverse();

  async function reload() {
    const r = await fetch("/api/governance/framework/events");
    if (r.ok) setEvents((await r.json()).events);
  }
  function openNew() { setForm(EMPTY); setEditId(null); setError(""); }
  function openEdit(e: CommEvent) {
    setForm({
      title: e.title, description: e.description ?? "", typeCode: e.typeCode, eventDate: e.eventDate, endDate: e.endDate ?? "",
      timeText: e.timeText ?? "", location: e.location ?? "", audience: e.audience ?? "", channel: e.channel ?? "",
      statusCode: e.statusCode, announce: e.announce,
    });
    setEditId(e.eventId); setError("");
  }
  async function save() {
    if (!form) return;
    if (!form.title.trim()) { setError(c.titleRequired); return; }
    if (!form.eventDate) { setError(c.dateRequired); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(editId ? `/api/governance/framework/events/${editId}` : "/api/governance/framework/events", {
        method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? c.saveFailed); return; }
      await reload();
      setForm(null);
    } finally { setSaving(false); }
  }
  async function remove(e: CommEvent) {
    if (!confirm(c.deleteConfirm)) return;
    const r = await fetch(`/api/governance/framework/events/${e.eventId}`, { method: "DELETE" });
    if (r.ok) setEvents((p) => p.filter((x) => x.eventId !== e.eventId));
  }

  const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) => setForm((p) => (p ? { ...p, [key]: value } : p));

  const row = (e: CommEvent) => (
    <li key={e.eventId} className="px-5 py-3.5 flex items-start gap-4">
      <div className="w-[108px] shrink-0">
        <div className="text-[13px] font-bold text-brand-deep" dir="auto">{fmtGovDate(e.eventDate, lang)}</div>
        {e.endDate && e.endDate !== e.eventDate && <div className="text-[11px] text-muted" dir="auto">– {fmtGovDate(e.endDate, lang)}</div>}
        {e.timeText && <div className="text-[11px] text-muted" dir="auto">{e.timeText}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple">{types[e.typeCode] ?? e.typeCode}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[e.statusCode] ?? STATUS_STYLE.CANCELLED}`}>{statuses[e.statusCode] ?? e.statusCode}</span>
          {e.announce && isUpcoming(e) && <span className="text-[10px] text-muted">{c.onDashboard}</span>}
        </div>
        <div className="text-sm font-semibold text-ink mt-1" dir="auto">{e.title}</div>
        {e.description && <p className="text-[12px] text-ink-soft mt-0.5 whitespace-pre-line" dir="auto">{e.description}</p>}
        <div className="text-[11px] text-muted mt-1 flex gap-x-4 gap-y-0.5 flex-wrap">
          {e.location && <span dir="auto">{c.fLocation}: {/^https?:\/\//i.test(e.location)
            ? <a href={e.location} target="_blank" rel="noopener noreferrer" className="text-brand-purple hover:underline break-all">{e.location}</a>
            : e.location}</span>}
          {e.audience && <span dir="auto">{c.fAudience}: {e.audience}</span>}
          {e.channel && <span dir="auto">{c.fChannel}: {e.channel}</span>}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => openEdit(e)} className="text-[11px] text-ink-soft hover:text-brand-purple">{t.common.edit}</button>
          <button onClick={() => remove(e)} className="text-[11px] text-ink-soft hover:text-red-500">{t.common.delete}</button>
        </div>
      )}
    </li>
  );

  return (
    <div className="card overflow-hidden mt-5">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-brand-deep">{c.scheduleTitle}</h2>
          <p className="text-[12px] text-muted mt-0.5">{c.scheduleDesc}</p>
        </div>
        {canManage && <button onClick={openNew} className="btn btn-primary btn-sm shrink-0">{c.addEvent}</button>}
      </div>

      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-soft">{c.noEvents}</p>
      ) : (
        <>
          <div className="px-5 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted">{c.upcoming} ({upcoming.length})</div>
          {upcoming.length === 0
            ? <p className="px-5 py-4 text-[13px] text-muted">{c.noUpcoming}</p>
            : <ul className="divide-y divide-line-soft">{upcoming.map(row)}</ul>}
          {past.length > 0 && (
            <div className="border-t border-line">
              <button onClick={() => setShowPast((v) => !v)} className="w-full px-5 py-2.5 text-start text-[12px] font-semibold text-brand-purple hover:bg-canvas">
                {showPast ? "▾" : "▸"} {c.past} ({past.length})
              </button>
              {showPast && <ul className="divide-y divide-line-soft border-t border-line-soft">{past.map(row)}</ul>}
            </div>
          )}
        </>
      )}

      {form && (
        <FormDialog
          title={editId ? c.editEvent : c.newEvent} subtitle={t.governance.sectionLabels.communication}
          onClose={() => setForm(null)}
          footer={<>
            <button type="button" onClick={() => setForm(null)} className="btn btn-sm">{t.common.cancel}</button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? t.common.saving : t.common.save}</button>
          </>}
        >
          <FormField label={c.fTitle} required>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className="field" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={c.fType}>
              <select value={form.typeCode} onChange={(e) => set("typeCode", e.target.value)} className="field">
                {COMM_EVENT_TYPES.map((x) => <option key={x} value={x}>{types[x]}</option>)}
              </select>
            </FormField>
            <FormField label={c.fStatus}>
              <select value={form.statusCode} onChange={(e) => set("statusCode", e.target.value)} className="field">
                {COMM_EVENT_STATUSES.map((x) => <option key={x} value={x}>{statuses[x]}</option>)}
              </select>
            </FormField>
            <FormField label={c.fDate} required>
              <input type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} className="field" />
            </FormField>
            <FormField label={c.fEndDate} hint={c.endDateHint}>
              <input type="date" value={form.endDate} min={form.eventDate || undefined} onChange={(e) => set("endDate", e.target.value)} className="field" />
            </FormField>
            <FormField label={c.fTime}>
              <input value={form.timeText} onChange={(e) => set("timeText", e.target.value)} className="field" placeholder="10:00 – 11:30" dir="ltr" />
            </FormField>
            <FormField label={c.fLocation} hint={c.locationHint}>
              <input value={form.location} onChange={(e) => set("location", e.target.value)} className="field" />
            </FormField>
            <FormField label={c.fAudience}>
              <input value={form.audience} onChange={(e) => set("audience", e.target.value)} className="field" placeholder={c.audiencePlaceholder} />
            </FormField>
            <FormField label={c.fChannel}>
              <input value={form.channel} onChange={(e) => set("channel", e.target.value)} className="field" placeholder={c.channelPlaceholder} />
            </FormField>
          </div>
          <FormField label={c.fDescription}>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className="field" />
          </FormField>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="accent-brand-purple w-4 h-4 mt-0.5" checked={form.announce} onChange={(e) => set("announce", e.target.checked)} />
            <span>
              <span className="block text-sm text-ink">{c.announceLabel}</span>
              <span className="block text-[11px] text-muted">{c.announceHint}</span>
            </span>
          </label>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        </FormDialog>
      )}
    </div>
  );
}
