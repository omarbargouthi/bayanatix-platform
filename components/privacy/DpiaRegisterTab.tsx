"use client";

// The register of impact assessments: every screening and assessment, its status, the
// risk before and after mitigation, open measures, the decision and the next review. Above it,
// what the daily check suggests screening (lib/privacy/dpia-watch.ts).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";
import { DPIA_STATUSES, type DpiaSuggestion, type DpiaSummary, type DpiaTemplate } from "@/lib/privacy/dpia-types";
import { AssetPicker, Dialog, ErrorNote, LevelBadge, StatusBadge, assetTypeLabel, day, errorText, fill, reasonText, type CustomTypeOption } from "./dpia-ui";

type Options = { templates: DpiaTemplate[]; users: { userId: string; name: string; role: string }[]; customTypes: CustomTypeOption[]; canCreate: boolean };

export function DpiaRegisterTab() {
  const { t, lang } = useLang();
  const d = t.dpia;
  const [items, setItems] = useState<DpiaSummary[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [isReviewer, setIsReviewer] = useState(false);
  const [suggestions, setSuggestions] = useState<DpiaSuggestion[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const load = useCallback(() => {
    fetch("/api/privacy/dpia").then((r) => (r.ok ? r.json() : { items: [] }))
      .then((res) => {
        setItems(res.items ?? []); setCanCreate(!!res.canCreate); setIsReviewer(!!res.isReviewer);
        setSuggestions(res.suggestions ?? []); setLastChecked(res.lastChecked ?? null);
      }).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (items ?? []).filter((r) => {
    if (status === "REVIEW_DUE" ? !r.reviewDue : status === "CHANGED" ? !r.changesPending : status && r.statusCode !== status) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.referenceCode, r.title, r.subject?.name ?? "", r.ownerName ?? ""].some((v) => v.toLowerCase().includes(q));
  }), [items, status, search]);
  const count = (fn: (r: DpiaSummary) => boolean) => (items ?? []).filter(fn).length;

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-brand-deep">{d.title}</h2>
          <p className="text-[13px] text-muted mt-1 max-w-4xl">{d.desc}</p>
        </div>
        {canCreate && <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm shrink-0">{d.newDpia}</button>}
      </div>

      {canCreate && <SuggestionsCard suggestions={suggestions} lastChecked={lastChecked} isReviewer={isReviewer} reload={load} />}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          [d.kpiInProgress, count((r) => r.statusCode === "SCREENING" || r.statusCode === "ASSESSMENT")],
          [d.kpiInReview, count((r) => r.statusCode === "IN_REVIEW")],
          [d.kpiOpenMeasures, (items ?? []).reduce((n, r) => n + r.measuresOpen, 0)],
          [d.kpiReviewDue, count((r) => r.reviewDue)],
          [t.dpiaWatch.kpiChanged, count((r) => r.changesPending)],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{label}</div>
            <div className="text-2xl font-bold text-brand-deep mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="input-field w-72" placeholder={d.searchPh} value={search} onChange={(e) => setSearch(e.target.value)} dir="auto" />
        <select className="input-field w-56" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={d.colStatus}>
          <option value="">{d.allStatuses}</option>
          {DPIA_STATUSES.map((s) => <option key={s} value={s}>{d.statuses[s]}</option>)}
          <option value="REVIEW_DUE">{d.reviewDue}</option>
          <option value="CHANGED">{t.dpiaWatch.filterChanged}</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-canvas-soft">
            <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
              <th className="px-4 py-2.5 text-start">{d.colReference}</th>
              <th className="px-4 py-2.5 text-start">{d.colSubject}</th>
              <th className="px-4 py-2.5 text-start">{d.colOwner}</th>
              <th className="px-4 py-2.5 text-start">{d.colStatus}</th>
              <th className="px-4 py-2.5 text-start">{d.colRisk}</th>
              <th className="px-4 py-2.5 text-start">{d.colMeasures}</th>
              <th className="px-4 py-2.5 text-start">{d.colDecided}</th>
              <th className="px-4 py-2.5 text-start">{d.colNextReview}</th>
            </tr>
          </thead>
          <tbody>
            {items && shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-muted">{items.length === 0 ? d.empty : d.noMatch}</td></tr>}
            {shown.map((r) => (
              <tr key={r.dpiaId} className="border-t border-line-soft hover:bg-canvas-soft/60">
                <td className="px-4 py-2.5">
                  <Link href={`/privacy/dpia/${r.dpiaId}`} className="text-[13px] font-semibold text-brand-purple hover:underline">{r.referenceCode}</Link>
                  <div className="text-[12px] text-ink" dir="auto">{r.title}</div>
                  <div className="text-[11px] text-muted">{pickTranslation(r.templateName, r.templateNameTranslations, lang)}</div>
                </td>
                <td className="px-4 py-2.5 text-[13px]">
                  {r.subject ? <><div className="text-ink" dir="auto">{r.subject.name}</div><div className="text-[11px] text-muted">{assetTypeLabel(t, r.subject.typeCode, r.subject.typeName)}</div></> : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[13px] text-ink-soft" dir="auto">{r.ownerName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.statusCode} />
                  {r.changesPending && <div className="text-[11px] font-semibold text-amber-700 mt-1">{t.dpiaWatch.changedBadge}</div>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {r.inherentLevel ? <span className="inline-flex items-center gap-1"><LevelBadge level={r.inherentLevel} /><span className="text-muted text-[11px]">→</span><LevelBadge level={r.residualLevel} /></span> : <span className="text-muted text-[12px]">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">
                  {r.measuresTotal === 0 ? "—" : `${r.measuresTotal - r.measuresOpen} / ${r.measuresTotal}`}
                  {r.measuresOverdue > 0 && <span className="ms-1.5 text-[11px] font-semibold text-red-700">{fill(d.overdueN, { n: r.measuresOverdue })}</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{day(r.decidedAt)}{r.versionNo > 0 && <div className="text-[11px] text-muted">{fill(d.versionN, { n: r.versionNo })}</div>}</td>
                <td className="px-4 py-2.5 text-[12px] whitespace-nowrap">
                  <span className="text-ink-soft">{day(r.nextReviewDate)}</span>
                  {r.reviewDue && <div className="text-[11px] font-semibold text-red-700">{d.reviewDue}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <NewDpiaDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/** What the daily check suggests screening: start one, or (an officer) dismiss it with a reason. */
function SuggestionsCard({ suggestions, lastChecked, isReviewer, reload }: { suggestions: DpiaSuggestion[]; lastChecked: string | null; isReviewer: boolean; reload: () => void }) {
  const { t } = useLang();
  const w = t.dpiaWatch;
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [starting, setStarting] = useState<DpiaSuggestion | null>(null);
  const [dismissing, setDismissing] = useState<DpiaSuggestion | null>(null);
  const open = suggestions.filter((s) => s.status === "OPEN");
  const dismissed = suggestions.filter((s) => s.status === "DISMISSED");

  async function check() {
    setChecking(true); setMessage(null);
    try {
      const r = await fetch("/api/privacy/dpia/watch", { method: "POST" });
      const res = await r.json().catch(() => ({}));
      setMessage(r.ok ? fill(w.checkedResult, { added: res.suggestions?.added ?? 0, changed: res.changes?.withChanges ?? 0 }) : errorText(t, res));
      reload();
    } finally { setChecking(false); }
  }
  async function restore(s: DpiaSuggestion) {
    const r = await fetch(`/api/privacy/dpia/suggestions/${s.suggestionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RESTORE" }) });
    if (!r.ok) setMessage(errorText(t, await r.json().catch(() => ({}))));
    reload();
  }

  const row = (s: DpiaSuggestion) => (
    <div key={s.suggestionId} className={`py-2.5 flex items-start justify-between gap-3 ${s.status === "DISMISSED" ? "opacity-70" : ""}`}>
      <div className="min-w-0">
        {s.href ? <Link href={s.href} className="text-[13px] font-semibold text-brand-purple hover:underline" dir="auto">{s.assetName}</Link> : <span className="text-[13px] font-semibold text-ink" dir="auto">{s.assetName}</span>}
        <span className="text-[11px] text-muted ms-2">{assetTypeLabel(t, s.assetTypeCode, s.assetTypeName)}{s.sublabel ? ` · ${s.sublabel}` : ""}</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {s.reasons.map((r) => <span key={r.code} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5" dir="auto">{reasonText(t, r)}</span>)}
        </div>
        <div className="text-[11px] text-muted mt-1" dir="auto">
          {s.status === "DISMISSED" ? <>{fill(w.dismissedBy, { user: s.dismissedBy ?? "—", date: day(s.dismissedAt) })}{s.dismissNote ? ` — ${s.dismissNote}` : ""}</> : fill(w.since, { date: day(s.firstSeenAt) })}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {s.status === "OPEN" && <button onClick={() => setStarting(s)} className="btn btn-primary btn-sm">{w.start}</button>}
        {s.status === "OPEN" && isReviewer && <button onClick={() => setDismissing(s)} className="btn btn-sm">{w.dismiss}</button>}
        {s.status === "DISMISSED" && isReviewer && <button onClick={() => restore(s)} className="btn btn-sm">{w.restore}</button>}
      </div>
    </div>
  );

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-brand-deep">{w.suggestionsTitle}{open.length > 0 && <span className="ms-2 text-[12px] font-semibold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">{open.length}</span>}</h3>
          <p className="text-[12px] text-muted mt-0.5 max-w-3xl">{w.suggestionsDesc}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-muted">{lastChecked ? fill(w.lastChecked, { date: lastChecked.replace("T", " ").slice(0, 16) }) : w.neverChecked}</span>
          {isReviewer && <button onClick={check} disabled={checking} className="btn btn-sm">{checking ? w.checking : w.checkNow}</button>}
        </div>
      </div>
      {message && <div className="text-[12px] text-ink-soft bg-canvas-soft rounded-md px-3 py-1.5 mt-3">{message}</div>}
      <div className="mt-2 divide-y divide-line-soft">
        {open.length === 0 && <p className="text-[13px] text-muted py-2">{w.noSuggestions}</p>}
        {open.map(row)}
        {showDismissed && dismissed.map(row)}
      </div>
      {dismissed.length > 0 && (
        <button onClick={() => setShowDismissed(!showDismissed)} className="text-[12px] text-brand-purple hover:underline mt-2">
          {showDismissed ? w.hideDismissed : fill(w.showDismissed, { n: dismissed.length })}
        </button>
      )}
      {starting && <NewDpiaDialog onClose={() => setStarting(null)} subject={{ typeCode: starting.assetTypeCode, id: starting.assetId, name: starting.assetName }} />}
      {dismissing && <DismissDialog suggestion={dismissing} onClose={() => setDismissing(null)} onDone={() => { setDismissing(null); reload(); }} />}
    </div>
  );
}

function DismissDialog({ suggestion, onClose, onDone }: { suggestion: DpiaSuggestion; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const w = t.dpiaWatch;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/privacy/dpia/suggestions/${suggestion.suggestionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DISMISS", note }) });
      if (r.ok) onDone(); else setError(errorText(t, await r.json().catch(() => ({}))));
    } finally { setBusy(false); }
  }
  return (
    <Dialog title={w.dismissTitle} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={save} disabled={busy || !note.trim()} className="btn btn-primary btn-sm">{w.dismiss}</button>
    </>}>
      <div className="text-[13px] font-semibold text-ink" dir="auto">{suggestion.assetName}</div>
      <p className="text-[12px] text-muted">{w.dismissHint}</p>
      <textarea className="input-field w-full" rows={3} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" />
      <ErrorNote text={error} />
    </Dialog>
  );
}

export function NewDpiaDialog({ onClose, subject }: { onClose: () => void; subject?: { typeCode: string; id: number; name: string } }) {
  const { t, lang } = useLang();
  const d = t.dpia;
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ title: subject?.name ?? "", description: "", templateId: 0, ownerUserId: "" });
  const [picked, setPicked] = useState<{ typeCode: string; id: number; name: string } | null>(subject ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/privacy/dpia?options=1").then((r) => (r.ok ? r.json() : null)).then((o: Options | null) => {
      if (!o) return;
      setOptions(o);
      setForm((f) => ({ ...f, templateId: (o.templates.find((x) => x.isDefault) ?? o.templates[0])?.templateId ?? 0 }));
    });
  }, []);
  const tpl = options?.templates.find((x) => x.templateId === form.templateId);

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/privacy/dpia", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, subjectType: picked?.typeCode, subjectId: picked?.id }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { setError(errorText(t, res)); return; }
      router.push(`/privacy/dpia/${res.dpiaId}`);
    } finally { setBusy(false); }
  }

  return (
    <Dialog title={d.newTitle} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={create} disabled={busy || !form.title.trim() || !form.templateId} className="btn btn-primary btn-sm">{busy ? d.creating : d.create}</button>
    </>}>
      <div>
        <label className="field-label">{d.fSubject}</label>
        {picked ? (
          <div className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2">
            <span className="text-[13px] text-ink" dir="auto">{picked.name}</span>
            {!subject && <button onClick={() => setPicked(null)} className="text-[12px] text-brand-purple hover:underline">{d.change}</button>}
          </div>
        ) : options ? (
          <AssetPicker customTypes={options.customTypes} defaultType={options.customTypes.some((c) => c.typeCode === "ACTIVITY") ? "CUSTOM:ACTIVITY" : undefined}
            onPick={(h) => { setPicked(h); setForm((f) => ({ ...f, title: f.title || h.name })); }} />
        ) : null}
        <p className="text-[11px] text-muted mt-1">{d.subjectHint}</p>
      </div>
      <div>
        <label className="field-label">{d.fTitle}</label>
        <input className="input-field w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} dir="auto" maxLength={255} />
      </div>
      <div>
        <label className="field-label">{d.fDescription}</label>
        <textarea className="input-field w-full" rows={2} placeholder={d.descriptionPh} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} dir="auto" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{d.fTemplate}</label>
          <select className="input-field w-full" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: Number(e.target.value) })}>
            {options?.templates.map((x) => <option key={x.templateId} value={x.templateId}>{pickTranslation(x.name, x.nameTranslations, lang)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{d.fOwner}</label>
          <select className="input-field w-full" value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}>
            <option value="">{d.ownerMe}</option>
            {options?.users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
          </select>
        </div>
      </div>
      {tpl && <p className="text-[11px] text-muted" dir="auto">{pickTranslation(tpl.regulation, tpl.regulationTranslations, lang)} — {pickTranslation(tpl.description, tpl.descriptionTranslations, lang)}</p>}
      <ErrorNote text={error} />
    </Dialog>
  );
}
