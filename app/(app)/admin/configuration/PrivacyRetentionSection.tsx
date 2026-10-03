"use client";

import { useEffect, useState } from "react";

type Settings = {
  auditLogDays: number | null; dataAccessLogDays: number | null; jobLogDays: number | null;
  notificationDays: number | null; dqSampleDays: number | null;
  lastRetentionRunAt: string | null; lastRetentionResult: Record<string, number> | null;
  consentEnabled: boolean; consentVersion: number;
  consentTitleEn: string; consentTextEn: string; consentTitleAr: string; consentTextAr: string; consentUpdatedAt: string | null;
};
type Stats = { version: number; activeUsers: number; accepted: number; recent: { userName: string; userId: string; version: number; decision: string; decidedAt: string }[] };

const RETENTION_FIELDS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: "auditLogDays", label: "Audit log", hint: "Metadata changes and who made them. Often subject to legal or regulatory minimums — check before shortening." },
  { key: "dataAccessLogDays", label: "Data access log", hint: "Views of live sample data, masked or in clear text." },
  { key: "jobLogDays", label: "Job logs", hint: "Crawl runs and their log lines, and background jobs (exports, imports, propagation) with their files." },
  { key: "notificationDays", label: "Notifications", hint: "In-app notifications, read or unread." },
  { key: "dqSampleDays", label: "Data quality samples", hint: "Example failing values kept with each data quality run (personal data is always masked)." },
];

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

// Configuration > Privacy & Retention: how long Bayanis keeps its own records, and
// the acceptable-use / activity-monitoring notice users accept after signing in.
export function PrivacyRetentionSection() {
  const [s, setS] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [retention, setRetention] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState({ enabled: false, titleEn: "", textEn: "", titleAr: "", textAr: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/privacy-settings");
    if (!r.ok) return;
    const d: { settings: Settings; consentStats: Stats } = await r.json();
    setS(d.settings); setStats(d.consentStats);
    setRetention(Object.fromEntries(RETENTION_FIELDS.map((f) => [f.key, d.settings[f.key] == null ? "" : String(d.settings[f.key])])));
    setConsent({ enabled: d.settings.consentEnabled, titleEn: d.settings.consentTitleEn, textEn: d.settings.consentTextEn, titleAr: d.settings.consentTitleAr, textAr: d.settings.consentTextAr });
  }
  useEffect(() => { load(); }, []);

  async function save(body: object, okText: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/privacy-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ kind: "err", text: d.error ?? "Failed to save" }); return; }
      setMsg({ kind: "ok", text: okText });
      await load();
    } finally { setBusy(false); }
  }

  async function runNow() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/retention/run", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ kind: "err", text: d.error ?? "Retention run failed" }); return; }
      const total = Object.values((d.result ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
      setMsg({ kind: "ok", text: `Retention run complete: ${total} record(s) removed.` });
      await load();
    } finally { setBusy(false); }
  }

  if (!s) return <div className="py-8 text-center text-muted text-sm">Loading…</div>;
  const consentChanged = consent.titleEn !== s.consentTitleEn || consent.textEn !== s.consentTextEn || consent.titleAr !== s.consentTitleAr || consent.textAr !== s.consentTextAr;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Privacy &amp; Retention</h2>
        <p className="text-xs text-muted mt-1">How long Bayanis keeps its own records, and the notice users accept before using Bayanis.</p>
      </div>

      {msg && (
        <div className={`text-[13px] rounded-md px-3 py-2 border ${msg.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>{msg.text}</div>
      )}

      {/* ── Retention ── */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-brand-deep">Retention of Bayanis records</h3>
            <p className="text-[12px] text-muted mt-0.5">Records older than the period are deleted automatically once a day. Leave a field empty to keep those records forever.</p>
          </div>
          <button onClick={runNow} disabled={busy} className="btn btn-sm shrink-0">Run now</button>
        </div>
        <div className="space-y-3">
          {RETENTION_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[200px_140px_1fr] gap-4 items-center">
              <div className="text-sm font-medium text-ink">{f.label}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} className="input w-24 text-sm" placeholder="forever"
                  value={retention[f.key] ?? ""} onChange={(e) => setRetention((r) => ({ ...r, [f.key]: e.target.value }))}
                />
                <span className="text-[12px] text-muted">days</span>
              </div>
              <div className="text-[12px] text-muted">{f.hint}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-line-soft">
          <span className="text-[12px] text-muted">
            Last run: {fmt(s.lastRetentionRunAt)}
            {s.lastRetentionResult && ` · ${Object.values(s.lastRetentionResult).reduce((a, b) => a + b, 0)} record(s) removed`}
            {" · "}Consent records are never deleted.
          </span>
          <button
            onClick={() => save({ retention: Object.fromEntries(Object.entries(retention).map(([k, v]) => [k, v === "" ? null : Number(v)])) }, "Retention periods saved.")}
            disabled={busy} className="btn btn-primary btn-sm"
          >Save retention</button>
        </div>
      </section>

      {/* ── Consent ── */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-brand-deep">User consent notice</h3>
            <p className="text-[12px] text-muted mt-0.5">
              When switched on, every user must accept this notice after signing in before using Bayanis. Declining signs them out.
              Every decision is recorded with its date, IP address and browser.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink shrink-0 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-brand-purple" checked={consent.enabled} onChange={(e) => setConsent((c) => ({ ...c, enabled: e.target.checked }))} />
            Require consent
          </label>
        </div>
        {stats && (
          <div className="text-[12px] text-ink-soft bg-canvas-soft rounded-md px-3 py-2">
            Current version: <b>{stats.version}</b>{s.consentUpdatedAt && ` (updated ${fmt(s.consentUpdatedAt)})`} · accepted by <b>{stats.accepted}</b> of {stats.activeUsers} active user(s)
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted uppercase block">Title (English)</label>
            <input className="input w-full text-sm" value={consent.titleEn} onChange={(e) => setConsent((c) => ({ ...c, titleEn: e.target.value }))} />
            <label className="text-[10px] font-semibold text-muted uppercase block">Notice (English)</label>
            <textarea className="input w-full text-[13px] leading-relaxed" rows={12} value={consent.textEn} onChange={(e) => setConsent((c) => ({ ...c, textEn: e.target.value }))} />
          </div>
          <div className="space-y-2" dir="rtl">
            <label className="text-[10px] font-semibold text-muted uppercase block">العنوان (عربي)</label>
            <input className="input w-full text-sm" value={consent.titleAr} onChange={(e) => setConsent((c) => ({ ...c, titleAr: e.target.value }))} />
            <label className="text-[10px] font-semibold text-muted uppercase block">نص الإشعار (عربي)</label>
            <textarea className="input w-full text-[13px] leading-relaxed" rows={12} value={consent.textAr} onChange={(e) => setConsent((c) => ({ ...c, textAr: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-soft">
          <button
            onClick={() => save({ consent: { ...consent, requireReacceptance: false } }, consent.enabled ? "Consent settings saved." : "Consent settings saved (notice is switched off).")}
            disabled={busy} className="btn btn-sm"
            title="Keeps existing acceptances: use for typo fixes that don't change the meaning"
          >Save</button>
          <button
            onClick={() => save({ consent: { ...consent, requireReacceptance: true } }, `Saved as version ${s.consentVersion + 1}. Every user will be asked to accept again.`)}
            disabled={busy || (!consentChanged && !consent.enabled)} className="btn btn-primary btn-sm"
            title="Creates a new version that every user must accept again"
          >Save and ask everyone to accept again</button>
        </div>
        {stats && stats.recent.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-2">Recent decisions</div>
            <div className="border border-line rounded-lg overflow-hidden">
              {stats.recent.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_110px_170px] gap-3 px-4 py-2 text-[12px] border-b border-line-soft last:border-0">
                  <span className="text-ink">{r.userName}</span>
                  <span className="text-muted">v{r.version}</span>
                  <span className={r.decision === "ACCEPTED" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{r.decision === "ACCEPTED" ? "Accepted" : "Declined"}</span>
                  <span className="text-muted">{fmt(r.decidedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
