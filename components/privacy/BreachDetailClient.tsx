"use client";

// One personal data breach: the regulator deadline at the top, then what happened, the
// affected data (with the catalog's facts about it), the risk, the notifications, the
// measures and the timeline. Officers, admins and the assigned handler edit it section
// by section; the person who reported it follows it read-only.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import {
  BREACH_CAUSES, BREACH_LAWS, BREACH_REGULATIONS, BREACH_RISKS, BREACH_TYPES, authorityLabel, isBreachOpen, subjectsAlwaysUnder, subjectsRequired,
  type BreachDetail, type BreachNotice, type BreachPermissions,
} from "@/lib/privacy/breach-types";
import { AssetPicker, Dialog, ErrorNote, FactLines, assetTypeLabel, factLines, fill, type CustomTypeOption } from "./dpia-ui";
import { BreachRiskBadge, BreachStatusBadge, NoticeLine, breachError, fromLocalInput, span, toLocalInput, when } from "./breach-ui";

type LawFramework = { law: string; frameworkId: number | null; frameworkName: string | null; applicable: boolean };
type Loaded = { breach: BreachDetail; permissions: BreachPermissions & { canAssign?: boolean }; missing: string[]; frameworks: LawFramework[] };
type FieldKind = "text" | "textarea" | "datetime" | "number" | "select" | "multi";
type Field = { key: string; label: string; kind: FieldKind; options?: [string, string][]; ph?: string; hint?: string; wide?: boolean };

export function BreachDetailClient({ breachId }: { breachId: number }) {
  const { t, lang } = useLang();
  const b = t.breach;
  const [data, setData] = useState<Loaded | null | "missing">(null);
  const [options, setOptions] = useState<{ users: { userId: string; name: string }[]; customTypes: CustomTypeOption[]; canAssign: boolean } | null>(null);
  const [dialog, setDialog] = useState<"CLOSE" | "NOT_A_BREACH" | "REOPEN" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/privacy/breaches/${breachId}`);
    setData(r.ok ? await r.json() : "missing");
  }, [breachId]);
  useEffect(() => { void load(); fetch("/api/privacy/breaches?options=1").then((r) => (r.ok ? r.json() : null)).then(setOptions); }, [load]);

  if (data === null) return <p className="text-sm text-muted">{b.loading}</p>;
  if (data === "missing") return <div className="card p-6 text-sm text-muted">{b.notFound} <Link href="/privacy/breaches" className="text-brand-purple hover:underline">{b.back}</Link></div>;
  const { breach: br, permissions: p, missing, frameworks } = data;
  const edit = p.canManage;
  const open = isBreachOpen(br.statusCode);

  async function post(body: object): Promise<boolean> {
    setError(null);
    const r = await fetch(`/api/privacy/breaches/${breachId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { setError(breachError(t, await r.json().catch(() => ({})))); return false; }
    await load();
    return true;
  }
  async function patch(body: object): Promise<string | null> {
    const r = await fetch(`/api/privacy/breaches/${breachId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return breachError(t, await r.json().catch(() => ({})));
    await load();
    return null;
  }

  const opts = <T extends string>(codes: readonly T[], labels: Record<T, string>): [string, string][] => codes.map((c) => [c, labels[c]]);

  return (
    <div className="space-y-4 max-w-6xl">
      <Link href="/privacy/breaches" className="text-[12px] text-brand-purple hover:underline">{b.back}</Link>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-brand-purple">{br.referenceCode}</span>
              <BreachStatusBadge status={br.statusCode} />
              <BreachRiskBadge level={br.riskLevel} />
            </div>
            <h1 className="text-lg font-bold text-brand-deep mt-1" dir="auto">{br.title}</h1>
            <p className="text-[12px] text-muted mt-0.5">{fill(b.reportedBy, { user: br.reportedByName ?? br.reportedByUserId, date: when(br.createdAt, lang) })}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {edit && br.statusCode === "REPORTED" && <button onClick={() => post({ action: "INVESTIGATE" })} className="btn btn-sm">{b.actInvestigate}</button>}
            {edit && (br.statusCode === "REPORTED" || br.statusCode === "INVESTIGATING") && <button onClick={() => post({ action: "CONTAIN" })} className="btn btn-sm">{b.actContain}</button>}
            {edit && open && <button onClick={() => setDialog("NOT_A_BREACH")} className="btn btn-sm">{b.actNotBreach}</button>}
            {edit && open && <button onClick={() => setDialog("CLOSE")} className="btn btn-primary btn-sm">{b.actClose}</button>}
            {edit && !open && <button onClick={() => setDialog("REOPEN")} className="btn btn-sm">{b.actReopen}</button>}
            <a href={`/api/privacy/breaches/${breachId}/export`} className="btn btn-sm">{b.exportPdf}</a>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="text-[12px] text-muted">{b.fOwner}:</span>
          {options?.canAssign && open ? (
            <select className="input-field w-64" value={br.ownerUserId ?? ""} onChange={(e) => void patch({ ownerUserId: e.target.value || null }).then((m) => m && setError(m))}>
              <option value="">{b.ownerUnassigned}</option>
              {options.users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
            </select>
          ) : <span className="text-[13px] text-ink" dir="auto">{br.ownerName ?? b.ownerUnassigned}</span>}
        </div>
        <ErrorNote text={error} />
      </div>

      <DeadlineBanner br={br} />
      {!edit && <p className="text-[13px] text-ink-soft bg-canvas-soft border border-line rounded-md px-4 py-2.5">{b.readOnly}</p>}

      <Section title={b.secWhat} br={br} edit={edit} save={patch} fields={[
        { key: "title", label: b.fTitle, kind: "text", wide: true },
        { key: "description", label: b.fDescription, kind: "textarea", ph: b.descriptionPh, wide: true },
        { key: "discoveredAt", label: b.fDiscoveredAt, kind: "datetime", hint: b.discoveredHint },
        { key: "howDiscovered", label: b.fHowDiscovered, kind: "textarea" },
        { key: "occurredFrom", label: b.fOccurredFrom, kind: "datetime" },
        { key: "occurredTo", label: b.fOccurredTo, kind: "datetime" },
        { key: "breachTypes", label: b.fTypes, kind: "multi", options: opts(BREACH_TYPES, b.types) },
        { key: "causeCode", label: b.fCause, kind: "select", options: [["", b.causeNone], ...opts(BREACH_CAUSES, b.causes)] },
        { key: "regulations", label: b.fRegulations, kind: "multi", options: opts(BREACH_REGULATIONS, b.regulations) },
      ]} />

      <AffectedData br={br} edit={edit} customTypes={options?.customTypes ?? []} post={post} save={patch} />

      <RiskSection br={br} edit={edit} save={patch} />

      <div className="grid md:grid-cols-2 gap-4">
        {br.notices.map((n) => <NoticeCard key={n.regulation} n={n} edit={edit} save={patch} framework={frameworks.find((f) => f.law === n.regulation)} />)}
        <Section title={b.subjTitle} br={br} edit={edit} save={patch} cols={1}
          note={subjectsAlwaysUnder(br.regulations).length ? fill(b.subjAlways, { laws: subjectsAlwaysUnder(br.regulations).map((l) => b.regulations[l]).join(", ") })
            : subjectsRequired(br.riskLevel, br.regulations) ? b.subjRequired : b.subjNotRequired}
          fields={[
            { key: "subjectsNotifiedAt", label: b.fSubjectsAt, kind: "datetime" },
            { key: "subjectsMethod", label: b.fSubjectsMethod, kind: "text" },
            { key: "subjectsNotified", label: b.fSubjectsCount, kind: "number" },
            ...(subjectsRequired(br.riskLevel, br.regulations) || br.subjectsExemption ? [{ key: "subjectsExemption", label: b.fExemption, kind: "textarea" as const, ph: b.exemptionPh }] : []),
          ]} />
      </div>

      <Section title={b.secMeasures} br={br} edit={edit} save={patch}
        note={br.containedAt ? fill(b.containedAt, { date: when(br.containedAt, lang) }) : undefined}
        fields={[
          { key: "containment", label: b.fContainment, kind: "textarea", wide: true },
          { key: "prevention", label: b.fPrevention, kind: "textarea", wide: true },
        ]} />

      <Timeline br={br} edit={edit} post={post} />

      {dialog && <MoveDialog kind={dialog} missing={missing} onClose={() => setDialog(null)}
        onDone={async (note) => { const ok = await post({ action: dialog, note }); if (ok) setDialog(null); return ok; }} />}
    </div>
  );
}

/** One line per law that applies: when and to whom the regulator notice is due, or was made. */
function DeadlineBanner({ br }: { br: BreachDetail }) {
  const { t, lang } = useLang();
  const b = t.breach;
  if (br.statusCode === "NOT_A_BREACH") return <div className="rounded-xl border px-5 py-3 text-[13px] font-semibold bg-slate-50 border-slate-200 text-slate-700">{b.deadlineNotBreach}</div>;
  const line = (n: BreachNotice) => {
    const v = { law: b.regulations[n.regulation], authority: authorityLabel(n, b.authorities), date: when(n.deadline, lang) };
    const due = n.deadline ? new Date(n.deadline).getTime() : 0;
    const late = n.notifiedAt ? new Date(n.notifiedAt).getTime() - due : Date.now() - due;
    switch (n.state) {
      case "NOT_REQUIRED": return fill(b.deadlineNotRequired, v);
      case "NOTIFIED": return fill(b.deadlineNotified, { ...v, date: when(n.notifiedAt, lang) });
      case "ON_TIME": return fill(b.deadlineOnTime, { ...v, date: when(n.notifiedAt, lang) });
      case "LATE": return fill(b.deadlineLate, { ...v, date: when(n.notifiedAt, lang), late: span(late, t) });
      case "ASAP": return fill(b.deadlineAsap, v);
      case "OVERDUE": return fill(b.deadlineOverdue, { ...v, late: span(late, t) });
      default: return fill(b.deadlineDue, { ...v, left: span(due - Date.now(), t) });
    }
  };
  const s = br.authorityState;
  const tone = s === "OVERDUE" ? "bg-red-50 border-red-300 text-red-800"
    : s === "DUE_SOON" || s === "ASAP" || s === "LATE" ? "bg-amber-50 border-amber-300 text-amber-900"
    : s === "DUE" ? "bg-sky-50 border-sky-200 text-sky-900"
    : s === "NOT_REQUIRED" ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-emerald-50 border-emerald-200 text-emerald-900";
  return (
    <div className={`rounded-xl border px-5 py-3 text-[13px] font-semibold space-y-0.5 ${tone}`}>
      {br.notices.map((n) => <div key={n.regulation}>{line(n)}</div>)}
      {!br.riskLevel && isBreachOpen(br.statusCode) && <span className="block text-[12px] font-normal mt-1">{b.deadlineUnassessed}</span>}
    </div>
  );
}

/** The regulator notice under one law: its rule, and when it was made. */
function NoticeCard({ n, edit, save, framework }: { n: BreachNotice; edit: boolean; save: (b: object) => Promise<string | null>; framework?: LawFramework }) {
  const { t, lang } = useLang();
  const b = t.breach;
  const init = () => ({ authorityName: n.authorityName ?? "", notifiedAt: toLocalInput(n.notifiedAt), reference: n.reference ?? "", lateReason: n.lateReason ?? "" });
  const [d, setD] = useState(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setD(init()); setError(null); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(d) !== JSON.stringify(init());
  const showLate = n.state === "LATE" || n.state === "OVERDUE" || !!n.lateReason;
  const field = (label: string, el: React.ReactNode, value: string) => (
    <div><label className="field-label">{label}</label>{edit ? el : <div className="text-[13px] text-ink" dir="auto">{value || "—"}</div>}</div>
  );
  async function submit() {
    setBusy(true); setError(null);
    try {
      setError(await save({ notices: { [n.regulation]: { authorityName: d.authorityName, notifiedAt: fromLocalInput(d.notifiedAt), reference: d.reference, ...(showLate ? { lateReason: d.lateReason } : {}) } } }));
    } finally { setBusy(false); }
  }
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[15px] font-bold text-brand-deep">{b.authTitle} · {b.regulations[n.regulation]}</h2>
        <NoticeLine n={n} showLaw={false} />
      </div>
      <p className="text-[12px] text-muted mt-0.5">{b.lawRules[n.regulation]}{!n.required && n.state === "NOT_REQUIRED" ? ` ${b.noticeNotRequired}` : ""}</p>
      {framework?.frameworkId != null && (
        <Link href={`/governance/compliance?fw=${framework.frameworkId}`} className="inline-block text-[12px] text-brand-purple hover:underline mt-1">
          {fill(b.frameworkLink, { name: framework.frameworkName ?? n.regulation })}
        </Link>
      )}
      <div className="space-y-3 mt-3">
        {field(b.fAuthorityName, <input className="input-field w-full" value={d.authorityName} placeholder={BREACH_LAWS[n.regulation].authority} dir="auto" onChange={(e) => setD({ ...d, authorityName: e.target.value })} />, authorityLabel(n, b.authorities))}
        {field(b.fAuthorityAt, <input type="datetime-local" className="input-field w-full" value={d.notifiedAt} max={toLocalInput(new Date().toISOString())} onChange={(e) => setD({ ...d, notifiedAt: e.target.value })} />, when(n.notifiedAt, lang))}
        {field(b.fAuthorityRef, <input className="input-field w-full" value={d.reference} dir="auto" onChange={(e) => setD({ ...d, reference: e.target.value })} />, n.reference ?? "")}
        {showLate && field(b.fLateReason, <textarea className="input-field w-full" rows={2} value={d.lateReason} dir="auto" onChange={(e) => setD({ ...d, lateReason: e.target.value })} />, n.lateReason ?? "")}
      </div>
      {edit && dirty && (
        <div className="flex items-center gap-2 mt-3">
          <button onClick={submit} disabled={busy} className="btn btn-primary btn-sm">{busy ? b.saving : b.save}</button>
          <button onClick={() => setD(init())} className="btn btn-sm">{t.common.cancel}</button>
        </div>
      )}
      <ErrorNote text={error} />
    </div>
  );
}

// ── An editable group of fields, saved together ─────────────────────────────
const shown = (br: BreachDetail, k: string) => (br as unknown as Record<string, unknown>)[k];
function toDraft(f: Field, v: unknown): unknown {
  if (f.kind === "datetime") return toLocalInput(v as string | null);
  if (f.kind === "number") return v == null ? "" : String(v);
  if (f.kind === "multi") return (v as string[] | null) ?? [];
  return (v as string | null) ?? "";
}
function fromDraft(f: Field, v: unknown): unknown {
  if (f.kind === "datetime") return fromLocalInput(v as string);
  if (f.kind === "number") return v === "" ? null : Number(v);
  return v;
}

function Section({ title, br, edit, save, fields, note, cols = 2 }: {
  title: string; br: BreachDetail; edit: boolean; save: (body: object) => Promise<string | null>; fields: Field[]; note?: string; cols?: 1 | 2;
}) {
  const { t, lang } = useLang();
  const b = t.breach;
  const initial = () => Object.fromEntries(fields.map((f) => [f.key, toDraft(f, shown(br, f.key))]));
  const [draft, setDraft] = useState<Record<string, unknown>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldKeys = fields.map((f) => f.key).join(",");
  useEffect(() => { setDraft(initial()); setError(null); }, [br, fieldKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = fields.filter((f) => JSON.stringify(draft[f.key]) !== JSON.stringify(toDraft(f, shown(br, f.key))));

  async function submit() {
    setBusy(true); setError(null);
    try { setError(await save(Object.fromEntries(changed.map((f) => [f.key, fromDraft(f, draft[f.key])])))); } finally { setBusy(false); }
  }

  return (
    <div className={title ? "card p-5" : ""}>
      {title && <h2 className="text-[15px] font-bold text-brand-deep">{title}</h2>}
      {note && <p className="text-[12px] text-muted mt-0.5">{note}</p>}
      <div className={`grid gap-x-4 gap-y-3 ${title ? "mt-3" : ""} ${cols === 2 ? "md:grid-cols-2" : ""}`}>
        {fields.map((f) => (
          <div key={f.key} className={f.wide && cols === 2 ? "md:col-span-2" : ""}>
            <label className="field-label">{f.label}</label>
            {edit ? <Input f={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} /> : <ReadValue f={f} value={shown(br, f.key)} t={t} lang={lang} />}
            {f.hint && edit && <p className="text-[11px] text-muted mt-1">{f.hint}</p>}
          </div>
        ))}
      </div>
      {edit && changed.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <button onClick={submit} disabled={busy} className="btn btn-primary btn-sm">{busy ? b.saving : b.save}</button>
          <button onClick={() => setDraft(initial())} className="btn btn-sm">{t.common.cancel}</button>
        </div>
      )}
      <ErrorNote text={error} />
    </div>
  );
}

function Input({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (f.kind === "textarea") return <textarea className="input-field w-full" rows={3} value={value as string} placeholder={f.ph} dir="auto" onChange={(e) => onChange(e.target.value)} />;
  if (f.kind === "datetime") return <input type="datetime-local" className="input-field w-full" value={value as string} max={toLocalInput(new Date().toISOString())} onChange={(e) => onChange(e.target.value)} />;
  if (f.kind === "number") return <input type="number" min={0} className="input-field w-full" value={value as string} onChange={(e) => onChange(e.target.value)} />;
  if (f.kind === "select") return <select className="input-field w-full" value={value as string} onChange={(e) => onChange(e.target.value)}>{f.options!.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>;
  if (f.kind === "multi") {
    const set = value as string[];
    return (
      <div className="space-y-1">
        {f.options!.map(([c, l]) => (
          <label key={c} className="flex items-start gap-2 text-[13px] text-ink">
            <input type="checkbox" className="mt-0.5 accent-brand-purple" checked={set.includes(c)} onChange={(e) => onChange(e.target.checked ? [...set, c] : set.filter((x) => x !== c))} />
            {l}
          </label>
        ))}
      </div>
    );
  }
  return <input className="input-field w-full" value={value as string} placeholder={f.ph} dir="auto" onChange={(e) => onChange(e.target.value)} />;
}

function ReadValue({ f, value, lang }: { f: Field; value: unknown; t: I18nStrings; lang: string }) {
  const empty = <span className="text-[13px] text-muted">—</span>;
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return empty;
  if (f.kind === "datetime") return <div className="text-[13px] text-ink">{when(value as string, lang)}</div>;
  if (f.kind === "multi") return <div className="text-[13px] text-ink">{(value as string[]).map((c) => f.options!.find((o) => o[0] === c)?.[1] ?? c).join(" · ")}</div>;
  if (f.kind === "select") return <div className="text-[13px] text-ink">{f.options!.find((o) => o[0] === value)?.[1] ?? String(value)}</div>;
  if (f.kind === "number") return <div className="text-[13px] text-ink">{Number(value).toLocaleString("en-US")}</div>;
  return <div className="text-[13px] text-ink whitespace-pre-wrap" dir="auto">{String(value)}</div>;
}

// ── Affected data ────────────────────────────────────────────────────────────
function AffectedData({ br, edit, customTypes, post, save }: { br: BreachDetail; edit: boolean; customTypes: CustomTypeOption[]; post: (b: object) => Promise<boolean>; save: (b: object) => Promise<string | null> }) {
  const { t, lang } = useLang();
  const b = t.breach;
  const blocks: [string, "PERSONAL_DATA" | "SCALE" | "FLOWS" | "RECIPIENTS"][] = [[b.blockPersonal, "PERSONAL_DATA"], [b.blockScale, "SCALE"], [b.blockFlows, "FLOWS"], [b.blockRecipients, "RECIPIENTS"]];
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-[15px] font-bold text-brand-deep">{b.secData}</h2>
        {br.factsAt && <span className="text-[11px] text-muted">{fill(b.factsAt, { date: when(br.factsAt, lang) })}{edit && br.assets.length > 0 && <> · <button onClick={() => post({ action: "REFRESH" })} className="text-brand-purple hover:underline">{b.refresh}</button></>}</span>}
      </div>
      {br.assets.length === 0 ? <p className="text-[13px] text-muted mt-2">{b.noAssets}</p> : (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {br.assets.map((a) => (
            <span key={`${a.typeCode}:${a.id}`} className="inline-flex items-center gap-1.5 text-[12px] bg-canvas-soft border border-line rounded-full ps-2.5 pe-1.5 py-0.5">
              {a.href ? <Link href={a.href} className="text-brand-purple hover:underline" dir="auto">{a.name}</Link> : <span dir="auto">{a.name}</span>}
              <span className="text-[10px] text-muted">{assetTypeLabel(t, a.typeCode, a.typeName, lang, a.typeNameTranslations)}</span>
              {edit && <button onClick={() => post({ action: "REMOVE_ASSET", typeCode: a.typeCode, assetId: a.id })} aria-label={b.remove} className="text-muted hover:text-red-600">&times;</button>}
            </span>
          ))}
        </div>
      )}
      {edit && (
        <div className="mt-3">
          <label className="field-label">{b.addAsset}</label>
          <AssetPicker customTypes={customTypes} defaultType="DATA_ENTITIES" onPick={(h) => void post({ action: "ADD_ASSET", typeCode: h.typeCode, assetId: h.id })} />
        </div>
      )}
      {br.facts && (
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          {blocks.map(([label, block]) => (
            <div key={block}>
              <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1">{label}</div>
              <FactLines lines={factLines(t, br.facts, block)} />
            </div>
          ))}
        </div>
      )}
      {br.largestPiTable && (
        <p className="text-[12px] text-ink-soft bg-canvas-soft rounded-md px-3 py-2 mt-4">
          {fill(b.largestHint, { table: br.largestPiTable.name, rows: br.largestPiTable.rows.toLocaleString("en-US") })}
          {edit && br.subjectsEstimate == null && <button onClick={() => void save({ subjectsEstimate: br.largestPiTable!.rows })} className="ms-2 text-brand-purple hover:underline font-semibold">{b.useAsEstimate}</button>}
        </p>
      )}
      <div className="mt-4">
        <Section title="" br={br} edit={edit} save={save} fields={[
          { key: "subjectsEstimate", label: b.fSubjects, kind: "number" },
          { key: "recordsEstimate", label: b.fRecords, kind: "number" },
        ]} />
      </div>
    </div>
  );
}

// ── Risk ─────────────────────────────────────────────────────────────────────
function RiskSection({ br, edit, save }: { br: BreachDetail; edit: boolean; save: (b: object) => Promise<string | null> }) {
  const { t, lang } = useLang();
  const b = t.breach;
  const s = br.riskSuggestion;
  return (
    <div className="card p-5">
      <h2 className="text-[15px] font-bold text-brand-deep">{b.secRisk}</h2>
      {s && (
        <div className="mt-3 text-[13px] bg-violet-50 border border-violet-200 rounded-md px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>
            <span className="font-semibold">{fill(b.suggestion, { level: b.risks[s.level] })}</span>{" "}
            <span className="text-ink-soft">{fill(b.suggestionWhy, { reasons: s.reasons.map((r) => b.reasons[r]).join(lang === "ar" ? "، " : ", ") })}</span>
          </span>
          {edit && br.riskLevel !== s.level && <button onClick={() => void save({ riskLevel: s.level })} className="btn btn-sm">{b.useSuggestion}</button>}
        </div>
      )}
      <div className="mt-3">
        <label className="field-label">{b.fRisk}</label>
        <div className="grid md:grid-cols-3 gap-2">
          {BREACH_RISKS.map((r) => (
            <button key={r} disabled={!edit} onClick={() => br.riskLevel !== r && void save({ riskLevel: r })}
              className={`text-start rounded-lg border px-3 py-2.5 transition-colors ${br.riskLevel === r ? "border-brand-purple bg-violet-50 ring-1 ring-brand-purple" : "border-line bg-white"} ${edit ? "hover:border-brand-purple" : "cursor-default"}`}>
              <div className="text-[13px] font-semibold text-ink">{b.risks[r]}</div>
              <div className="text-[11px] text-muted mt-0.5">{b.riskHelp[r]}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1">
        <Section title="" br={br} edit={edit} save={save} cols={2} fields={[
          { key: "riskReason", label: b.fRiskReason, kind: "textarea", ph: b.riskReasonPh },
          { key: "consequences", label: b.fConsequences, kind: "textarea" },
        ]} />
      </div>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────
function Timeline({ br, edit, post }: { br: BreachDetail; edit: boolean; post: (b: object) => Promise<boolean> }) {
  const { t, lang } = useLang();
  const b = t.breach;
  const [note, setNote] = useState("");
  const label = (code: string) => (b.events as Record<string, string>)[code] ?? code;
  const detail = (code: string, n: string | null) => (code === "RISK" && n ? (b.riskShort as Record<string, string>)[n] ?? n : n);
  return (
    <div className="card p-5">
      <h2 className="text-[15px] font-bold text-brand-deep">{b.secTimeline}</h2>
      {edit && (
        <div className="flex gap-2 mt-3">
          <input className="input-field flex-1" value={note} placeholder={b.notePh} dir="auto" onChange={(e) => setNote(e.target.value)} />
          <button disabled={!note.trim()} onClick={async () => { if (await post({ action: "NOTE", note })) setNote(""); }} className="btn btn-sm">{b.addNote}</button>
        </div>
      )}
      <ol className="mt-3 space-y-2.5 border-s-2 border-line ps-4">
        {br.events.map((e) => (
          <li key={e.eventId} className="text-[13px]">
            <div className="text-[11px] text-muted">{when(e.at, lang)} · <span dir="auto">{e.user ?? b.system}</span></div>
            <div className="text-ink"><span className="font-semibold">{label(e.code)}</span>{detail(e.code, e.note) && <span className="text-ink-soft" dir="auto"> — {detail(e.code, e.note)}</span>}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MoveDialog({ kind, missing, onClose, onDone }: { kind: "CLOSE" | "NOT_A_BREACH" | "REOPEN"; missing: string[]; onClose: () => void; onDone: (note: string) => Promise<boolean> }) {
  const { t } = useLang();
  const b = t.breach;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = kind === "CLOSE" && missing.length > 0;
  const title = kind === "CLOSE" ? b.closeTitle : kind === "NOT_A_BREACH" ? b.notBreachTitle : b.reopenTitle;
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      {!blocked && <button disabled={busy || (kind === "NOT_A_BREACH" && !note.trim())} onClick={async () => { setBusy(true); try { await onDone(note); } finally { setBusy(false); } }} className="btn btn-primary btn-sm">
        {kind === "CLOSE" ? b.actClose : kind === "NOT_A_BREACH" ? b.actNotBreach : b.actReopen}
      </button>}
    </>}>
      {blocked ? (
        <div className="text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <div className="font-semibold">{b.missingTitle}</div>
          <ul className="list-disc ms-5 mt-1">{missing.map((m) => {
            const [code, law] = m.split(":");
            const text = (b.missing as Record<string, string>)[code] ?? code;
            return <li key={m}>{law ? fill(text, { law: (b.regulations as Record<string, string>)[law] ?? law }) : text}</li>;
          })}</ul>
        </div>
      ) : <>
        {kind !== "REOPEN" && <p className="text-[12px] text-muted">{kind === "CLOSE" ? b.closeHint : b.notBreachHint}</p>}
        <label className="field-label">{kind === "REOPEN" ? b.events.NOTE : b.fCloseNote}</label>
        <textarea className="input-field w-full" rows={3} value={note} dir="auto" onChange={(e) => setNote(e.target.value)} />
      </>}
    </Dialog>
  );
}
