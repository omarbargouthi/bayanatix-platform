"use client";

// One impact assessment, from screening to decision. The catalog's facts about the
// linked assets sit beside the questions they answer; a decided assessment is shown
// as it is now, and each frozen version as it was when it was decided.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";
import {
  CONSULTATION_CODES, isClosed, overallResidual, screeningRecommendation,
  type DpiaDetail, type DpiaPermissions, type DpiaQuestion,
} from "@/lib/privacy/dpia-types";
import {
  AssetPicker, Dialog, ErrorNote, FACT_BLOCKS, FactLines, LevelBadge, StatusBadge, assetTypeLabel, changeText, day, errorText, factLines, fill, flagText,
  type CustomTypeOption, type FactBlock,
} from "./dpia-ui";
import { DpiaRisksTab } from "./DpiaRisksTab";

type Tab = "overview" | "screening" | "assessment" | "risks" | "review" | "history";
const TABS: Tab[] = ["overview", "screening", "assessment", "risks", "review", "history"];
type Loaded = { dpia: DpiaDetail; permissions: DpiaPermissions | null; frozenVersion: number | null };
type Options = { users: { userId: string; name: string }[]; customTypes: CustomTypeOption[] };
const SECTIONS = ["DESCRIPTION", "NECESSITY", "CONSULTATION"] as const;

export function DpiaDetailClient({ dpiaId }: { dpiaId: number }) {
  const { t, lang } = useLang();
  const d = t.dpia;
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [options, setOptions] = useState<Options>({ users: [], customTypes: [] });
  const [tab, setTab] = useState<Tab>(TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "overview");
  const [version, setVersion] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dialog, setDialog] = useState<"edit" | "reopen" | "ack" | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/privacy/dpia/${dpiaId}${version ? `?version=${version}` : ""}`);
    if (!r.ok) { setMissing(true); return; }
    setData(await r.json());
  }, [dpiaId, version]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/privacy/dpia?options=1").then((r) => (r.ok ? r.json() : null)).then((o) => o && setOptions(o)); }, []);

  /** Sends a change and reloads; the caller decides how to show a failure. */
  const call = useCallback(async (url: string, method: string, body?: object) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const res = await r.json().catch(() => ({}));
    if (r.ok) await load();
    return { ok: r.ok, res };
  }, [load]);
  const act = useCallback(async (body: object, okText?: string) => {
    setMessage(null);
    const r = await call(`/api/privacy/dpia/${dpiaId}`, "PATCH", body);
    if (!r.ok) setMessage({ kind: "err", text: errorText(t, r.res) });
    else if (okText) setMessage({ kind: "ok", text: okText });
    return r.ok;
  }, [call, dpiaId, t]);

  if (missing) return <main className="px-8 py-7 pb-14"><div className="card p-10 text-center text-sm text-muted">{d.notFound}</div></main>;
  if (!data) return <main className="px-8 py-7 pb-14"><div className="card p-10 text-center text-sm text-muted">{d.loading}</div></main>;
  const { dpia, permissions, frozenVersion } = data;
  const p = frozenVersion ? null : permissions;
  const tpl = dpia.template;

  return (
    <main className="px-8 py-7 pb-14 space-y-4">
      <Link href="/privacy?tab=dpia" className="text-[13px] text-brand-purple hover:underline">{d.back}</Link>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-brand-deep">{dpia.referenceCode}</h1>
              <StatusBadge status={dpia.statusCode} />
              {dpia.reviewDue && !frozenVersion && <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{d.reviewDue}</span>}
            </div>
            <div className="text-[15px] text-ink mt-1 font-medium" dir="auto">{dpia.title}</div>
            {dpia.description && <div className="text-[13px] text-ink-soft mt-0.5" dir="auto">{dpia.description}</div>}
            <div className="text-[12px] text-muted mt-1.5" dir="auto">
              {pickTranslation(tpl.name, tpl.nameTranslations, lang)} · {d.colOwner}: {dpia.ownerName ?? "—"}
              {dpia.subject && <> · {assetTypeLabel(t, dpia.subject.typeCode, dpia.subject.typeName)}: {dpia.subject.name}</>}
              {dpia.nextReviewDate && <> · {d.colNextReview}: {dpia.nextReviewDate}</>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 text-[12px] text-muted">
              <span>{d.inherent} <LevelBadge level={dpia.inherentLevel} /></span>
              <span>{d.residual} <LevelBadge level={dpia.residualLevel} /></span>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <a href={`/api/privacy/dpia/${dpiaId}/export${frozenVersion ? `?version=${frozenVersion}` : ""}`} className="btn btn-sm">{d.exportPdf}</a>
              {p?.canEdit && <button onClick={() => setDialog("edit")} className="btn btn-sm">{t.common.edit}</button>}
              {p?.canReopen && <button onClick={() => setDialog("reopen")} className="btn btn-sm">{d.reopen}</button>}
              {p?.canDelete && <button onClick={async () => {
                if (!window.confirm(d.deleteConfirm)) return;
                const r = await fetch(`/api/privacy/dpia/${dpiaId}`, { method: "DELETE" });
                if (r.ok) router.push("/privacy?tab=dpia"); else setMessage({ kind: "err", text: errorText(t, await r.json().catch(() => ({}))) });
              }} className="btn btn-sm text-red-600">{t.common.delete}</button>}
            </div>
          </div>
        </div>
      </div>

      {frozenVersion && (
        <div className="text-[13px] rounded-md px-4 py-2.5 border text-amber-900 bg-amber-50 border-amber-200 flex justify-between gap-3">
          <span>{fill(d.frozenBanner, { n: frozenVersion, date: day(dpia.decidedAt) })}</span>
          <button onClick={() => { setData(null); setVersion(null); }} className="font-semibold hover:underline shrink-0">{d.backToCurrent}</button>
        </div>
      )}
      {message && (
        <div className={`text-[13px] rounded-md px-4 py-2.5 border flex justify-between ${message.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
          <span>{message.text}</span><button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {!frozenVersion && dpia.changes && dpia.changes.length > 0 && (
        <div className="rounded-md px-4 py-3 border text-amber-900 bg-amber-50 border-amber-200">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[13px] font-semibold">{t.dpiaWatch.bannerTitle[dpia.statusCode === "NOT_REQUIRED" || dpia.statusCode === "IN_REVIEW" ? dpia.statusCode : "DECIDED"]}</div>
              <div className="text-[12px] mt-0.5">{fill(dpia.statusCode === "IN_REVIEW" ? t.dpiaWatch.bannerHintReview : t.dpiaWatch.bannerHint, { date: day(dpia.changesAt) })}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              {p?.canReopen && <button onClick={() => setDialog("reopen")} className="btn btn-sm">{d.reopen}</button>}
              {p?.canReview && tab !== "review" && <button onClick={() => setTab("review")} className="btn btn-sm">{d.tabs.review}</button>}
              {p?.canAcknowledgeChanges && <button onClick={() => setDialog("ack")} className="btn btn-sm">{t.dpiaWatch.ackButton}</button>}
            </div>
          </div>
          <ul className="mt-2 list-disc ps-5 text-[13px] space-y-0.5">
            {dpia.changes.map((c, i) => <li key={i} dir="auto">{changeText(t, c)}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {TABS.map((id) => (
          <button key={id} onClick={() => setTab(id)}
            className={["px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap", tab === id ? "border-brand-purple text-brand-purple" : "border-transparent text-muted hover:text-ink"].join(" ")}>
            {d.tabs[id]}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab dpia={dpia} permissions={p} options={options} act={act} />}
      {tab === "screening" && <ScreeningTab dpia={dpia} permissions={p} act={act} onDecided={(required) => setTab(required ? "assessment" : "review")} />}
      {tab === "assessment" && <AssessmentTab dpia={dpia} permissions={p} act={act} />}
      {tab === "risks" && <DpiaRisksTab dpia={dpia} permissions={p} users={options.users} call={call} />}
      {tab === "review" && <ReviewTab dpia={dpia} permissions={p} act={act} goTo={setTab} />}
      {tab === "history" && <HistoryTab dpia={dpia} dpiaId={dpiaId} current={frozenVersion} onView={(n) => { setData(null); setVersion(n); setTab("overview"); }} />}

      {dialog === "edit" && <EditDialog dpia={dpia} users={options.users} onClose={() => setDialog(null)} act={act} />}
      {dialog === "reopen" && <ReasonDialog title={d.reopen} hint={d.reopenHint} confirm={d.reopen} onClose={() => setDialog(null)}
        onConfirm={(note) => act({ action: "REOPEN", note }, d.reopened)} />}
      {dialog === "ack" && <ReasonDialog title={t.dpiaWatch.ackTitle} hint={t.dpiaWatch.ackHint} confirm={t.dpiaWatch.ackButton} onClose={() => setDialog(null)}
        onConfirm={(note) => act({ action: "ACK_CHANGES", note }, t.dpiaWatch.acknowledged)} />}
    </main>
  );
}

type Act = (body: object, okText?: string) => Promise<boolean>;
type TabProps = { dpia: DpiaDetail; permissions: DpiaPermissions | null; act: Act };

// ── Overview: what it is about, and what the catalog says about it ───────────
function OverviewTab({ dpia, permissions, options, act }: TabProps & { options: Options }) {
  const { t } = useLang();
  const d = t.dpia;
  const facts = dpia.facts;
  const canEdit = !!permissions?.canEdit;
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-[15px] font-bold text-brand-deep">{d.scopeTitle}</h3>
        <p className="text-[12px] text-muted mt-0.5 max-w-3xl">{d.scopeDesc}</p>
        <div className="mt-3 divide-y divide-line-soft">
          {dpia.assets.length === 0 && <p className="text-[13px] text-muted py-2">{d.noAssets}</p>}
          {dpia.assets.map((a) => (
            <div key={`${a.typeCode}:${a.id}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                {a.href ? <Link href={a.href} className="text-[13px] font-medium text-brand-purple hover:underline" dir="auto">{a.name}</Link> : <span className="text-[13px] font-medium text-ink" dir="auto">{a.name}</span>}
                <span className="text-[11px] text-muted ms-2">{assetTypeLabel(t, a.typeCode, a.typeName)}{a.sublabel ? ` · ${a.sublabel}` : ""}</span>
                {a.isSubject && <span className="ms-2 text-[10px] font-bold uppercase tracking-wider text-brand-purple bg-brand-purple/10 rounded px-1.5 py-0.5">{d.subjectTag}</span>}
              </div>
              {canEdit && (
                <div className="flex gap-3 text-[12px] shrink-0">
                  {!a.isSubject && <button onClick={() => act({ action: "SET_SUBJECT", assetType: a.typeCode, assetId: a.id })} className="text-brand-purple hover:underline">{d.makeSubject}</button>}
                  <button onClick={() => act({ action: "REMOVE_ASSET", assetType: a.typeCode, assetId: a.id })} className="text-red-600 hover:underline">{d.remove}</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {canEdit && <div className="mt-3"><AssetPicker customTypes={options.customTypes} onPick={(h) => act({ action: "ADD_ASSET", assetType: h.typeCode, assetId: h.id })} /></div>}
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-brand-deep">{d.findingsTitle}</h3>
            <p className="text-[12px] text-muted mt-0.5">{facts ? fill(d.factsAsOf, { date: (dpia.factsAt ?? facts.generatedAt).replace("T", " ").slice(0, 16) }) : d.facts.none}</p>
          </div>
          {canEdit && <button onClick={() => act({ action: "REFRESH" }, d.refreshed)} className="btn btn-sm shrink-0">{d.refresh}</button>}
        </div>
        {facts && facts.flags.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {facts.flags.map((f) => (
              <li key={f.code} className="text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5" dir="auto">{flagText(t, f)}</li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted mt-3">{d.noFindings}</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {FACT_BLOCKS.map((b) => (
          <div key={b} className="card p-4">
            <div className="text-[12px] font-bold text-brand-deep mb-1.5">{d.facts.blocks[b]}</div>
            <FactLines lines={factLines(t, facts, b)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screening ────────────────────────────────────────────────────────────────
function ScreeningTab({ dpia, permissions, act, onDecided }: TabProps & { onDecided: (required: boolean) => void }) {
  const { t, lang } = useLang();
  const d = t.dpia;
  const open = dpia.statusCode === "SCREENING" && !!permissions?.canEdit;
  const questions = dpia.questions.filter((q) => q.stage === "SCREENING");
  const rec = screeningRecommendation(dpia.questions, dpia.template.threshold);
  const flags = dpia.facts?.flags ?? [];
  const [note, setNote] = useState("");
  const decide = async (outcome: "REQUIRED" | "NOT_REQUIRED") => { if (await act({ action: "SCREEN", outcome, note })) onDecided(outcome === "REQUIRED"); };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-[15px] font-bold text-brand-deep">{d.screeningTitle}</h3>
        <p className="text-[12px] text-muted mt-0.5 max-w-3xl" dir="auto">
          {pickTranslation(dpia.template.regulation, dpia.template.regulationTranslations, lang)}. {fill(dpia.template.threshold === 1 ? d.ruleOne : d.ruleMany, { n: dpia.template.threshold })}
        </p>
      </div>
      <div className="card divide-y divide-line-soft">
        {questions.map((q, i) => {
          const hint = q.autoCode ? flags.find((f) => f.code === q.autoCode) : undefined;
          return (
            <div key={q.questionId} className="p-4 flex items-start gap-4">
              <div className="text-[12px] font-bold text-muted w-5 pt-0.5">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink" dir="auto">{pickTranslation(q.text, q.textTranslations, lang)}</div>
                {q.help && <div className="text-[12px] text-muted mt-0.5" dir="auto">{pickTranslation(q.help, q.helpTranslations, lang)}</div>}
                {hint && <div className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 inline-block" dir="auto">{d.catalogSuggestsYes} {flagText(t, hint)}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                {(["YES", "NO"] as const).map((v) => (
                  <button key={v} disabled={!open} onClick={() => act({ action: "ANSWERS", answers: [{ questionId: q.questionId, answerCode: v }] })}
                    className={["px-3 py-1.5 text-[12px] font-semibold rounded-md border transition-colors",
                      q.answerCode === v ? (v === "YES" ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-emerald-100 border-emerald-300 text-emerald-900") : "bg-white border-line text-ink-soft",
                      open ? "hover:border-brand-purple" : "opacity-70 cursor-default"].join(" ")}>
                    {v === "YES" ? d.yes : d.no}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <div className="text-[13px] text-ink">
          {fill(d.screeningCount, { yes: rec.yes, answered: rec.answered, total: rec.total })}{" "}
          {rec.answered === rec.total && <strong className={rec.required ? "text-amber-800" : "text-emerald-700"}>{rec.required ? d.recRequired : d.recNotRequired}</strong>}
        </div>
        {dpia.screeningOutcome && (
          <div className="mt-2 text-[13px] text-ink-soft" dir="auto">
            {fill(dpia.screeningOutcome === "REQUIRED" ? d.outcomeRequired : d.outcomeNotRequired, { by: dpia.screeningBy ?? "—", date: day(dpia.screeningAt) })}
            {dpia.screeningNote && <div className="mt-1 bg-canvas-soft rounded px-2 py-1">{dpia.screeningNote}</div>}
          </div>
        )}
        {open && (
          <div className="mt-3 space-y-2">
            <textarea className="input-field w-full" rows={2} placeholder={d.screeningNotePh} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" />
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => decide("NOT_REQUIRED")} disabled={rec.answered < rec.total} className="btn btn-sm">{d.recordNotRequired}</button>
              <button onClick={() => decide("REQUIRED")} disabled={rec.answered < rec.total} className="btn btn-primary btn-sm">{d.startAssessment}</button>
            </div>
            {rec.required && <p className="text-[11px] text-muted text-end">{d.overrideHint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assessment ───────────────────────────────────────────────────────────────
function AssessmentTab({ dpia, permissions, act }: TabProps) {
  const { t } = useLang();
  const d = t.dpia;
  const open = dpia.statusCode === "ASSESSMENT" && !!permissions?.canEdit;
  const questions = dpia.questions.filter((q) => q.stage === "ASSESSMENT");
  if (dpia.statusCode === "SCREENING") return <div className="card p-10 text-center text-sm text-muted">{d.assessmentAfterScreening}</div>;
  if (dpia.statusCode === "NOT_REQUIRED") return <div className="card p-10 text-center text-sm text-muted">{d.assessmentNotRequired}</div>;
  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => {
        const qs = questions.filter((q) => q.section === section);
        if (qs.length === 0) return null;
        return (
          <div key={section} className="card">
            <div className="px-5 py-3 border-b border-line text-[14px] font-bold text-brand-deep">{d.sections[section]}</div>
            <div className="divide-y divide-line-soft">
              {qs.map((q) => <AnswerRow key={`${q.questionId}:${q.answerText ?? ""}`} q={q} dpia={dpia} open={open} act={act} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnswerRow({ q, dpia, open, act }: { q: DpiaQuestion; dpia: DpiaDetail; open: boolean; act: Act }) {
  const { t, lang } = useLang();
  const d = t.dpia;
  const [value, setValue] = useState(q.answerText ?? "");
  const [saved, setSaved] = useState(false);
  const lines = q.autoCode ? factLines(t, dpia.facts, q.autoCode as FactBlock) : [];
  const save = async (text: string) => {
    if (text.trim() === (q.answerText ?? "").trim()) return;
    if (await act({ action: "ANSWERS", answers: [{ questionId: q.questionId, answerText: text }] })) setSaved(true);
  };
  return (
    <div className="p-5">
      <div className="text-[13px] font-semibold text-ink" dir="auto">
        {pickTranslation(q.text, q.textTranslations, lang)}{q.required && <span className="text-red-600 ms-1" title={d.required}>*</span>}
      </div>
      {q.help && <div className="text-[12px] text-muted mt-0.5" dir="auto">{pickTranslation(q.help, q.helpTranslations, lang)}</div>}
      {q.autoCode && (
        <div className="mt-2 bg-canvas-soft border border-line-soft rounded-md px-3 py-2">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.fromCatalog}</div>
            {open && lines.length > 0 && (
              <button onClick={() => { const next = [value.trim(), lines.join("\n")].filter(Boolean).join("\n"); setValue(next); save(next); }} className="text-[12px] text-brand-purple hover:underline">{d.useFacts}</button>
            )}
          </div>
          <FactLines lines={lines} />
        </div>
      )}
      {open ? (
        <>
          <textarea className="input-field w-full mt-2" rows={Math.min(10, Math.max(3, value.split("\n").length + 1))} value={value} dir="auto" placeholder={d.answerPh}
            onChange={(e) => { setValue(e.target.value); setSaved(false); }} onBlur={() => save(value)} />
          {saved && <div className="text-[11px] text-emerald-700 mt-0.5">{d.saved}</div>}
        </>
      ) : (
        <div className="mt-2 text-[13px] text-ink whitespace-pre-wrap" dir="auto">{q.answerText || <span className="text-muted">{d.noAnswer}</span>}</div>
      )}
    </div>
  );
}

// ── Review and decision ──────────────────────────────────────────────────────
function ReviewTab({ dpia, permissions, act, goTo }: TabProps & { goTo: (tab: Tab) => void }) {
  const { t } = useLang();
  const d = t.dpia;
  const residual = overallResidual(dpia.risks);
  const missing = dpia.questions.filter((q) => q.stage === "ASSESSMENT" && q.required && !q.answerText).length;
  const checks: [boolean, string, Tab][] = [
    [dpia.assets.length > 0, d.checkScope, "overview"],
    [missing === 0, missing === 0 ? d.checkAnswers : fill(d.checkAnswersMissing, { n: missing }), "assessment"],
    [dpia.risks.length > 0, d.checkRisks, "risks"],
  ];
  const [f, setF] = useState({ decision: "APPROVED", opinion: "", conditions: "", consultationCode: "NOT_RECORDED", consultationNote: "", nextReviewDate: "" });
  const [returning, setReturning] = useState(false);
  const closed = isClosed(dpia.statusCode);

  return (
    <div className="space-y-4">
      {dpia.statusCode === "SCREENING" && <div className="card p-10 text-center text-sm text-muted">{d.assessmentAfterScreening}</div>}

      {dpia.statusCode === "ASSESSMENT" && (
        <div className="card p-5">
          <h3 className="text-[15px] font-bold text-brand-deep">{d.submitTitle}</h3>
          <p className="text-[12px] text-muted mt-0.5">{d.submitDesc}</p>
          <ul className="mt-3 space-y-1.5">
            {checks.map(([ok, label, tab]) => (
              <li key={label} className="flex items-center gap-2 text-[13px]">
                <span className={ok ? "text-emerald-600" : "text-red-600"}>{ok ? "✓" : "✗"}</span>
                <span className={ok ? "text-ink-soft" : "text-ink"}>{label}</span>
                {!ok && <button onClick={() => goTo(tab)} className="text-[12px] text-brand-purple hover:underline">{d.goThere}</button>}
              </li>
            ))}
          </ul>
          {permissions?.canEdit && (
            <div className="mt-4 flex justify-end">
              <button onClick={() => act({ action: "SUBMIT" }, d.submitted)} disabled={checks.some(([ok]) => !ok)} className="btn btn-primary btn-sm">{d.submit}</button>
            </div>
          )}
        </div>
      )}

      {dpia.statusCode === "IN_REVIEW" && (
        <div className="card p-5 space-y-3">
          <div>
            <h3 className="text-[15px] font-bold text-brand-deep">{d.reviewTitle}</h3>
            <p className="text-[12px] text-muted mt-0.5" dir="auto">{fill(d.submittedBy, { by: dpia.submittedBy ?? "—", date: day(dpia.submittedAt) })}</p>
          </div>
          {residual === "HIGH" && <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{d.highResidual}</div>}
          {!permissions?.canReview ? <p className="text-[13px] text-muted">{d.awaitingReview}</p> : (
            <>
              <div>
                <label className="field-label">{d.opinion}</label>
                <textarea className="input-field w-full" rows={3} value={f.opinion} onChange={(e) => setF({ ...f, opinion: e.target.value })} placeholder={d.opinionPh} dir="auto" />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">{d.decision}</label>
                  <select className="input-field w-full" value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })}>
                    {(["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"] as const).map((s) => <option key={s} value={s}>{d.decisions[s]}</option>)}
                  </select>
                </div>
                {f.decision !== "REJECTED" && (
                  <div>
                    <label className="field-label">{d.colNextReview}</label>
                    <input type="date" className="input-field w-full" value={f.nextReviewDate} onChange={(e) => setF({ ...f, nextReviewDate: e.target.value })} />
                    <p className="text-[11px] text-muted mt-1">{d.nextReviewHint}</p>
                  </div>
                )}
              </div>
              {f.decision === "APPROVED_WITH_CONDITIONS" && (
                <div>
                  <label className="field-label">{d.conditions}</label>
                  <textarea className="input-field w-full" rows={2} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} dir="auto" />
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">{d.consultation}</label>
                  <select className="input-field w-full" value={f.consultationCode} onChange={(e) => setF({ ...f, consultationCode: e.target.value })}>
                    {CONSULTATION_CODES.map((c) => <option key={c} value={c}>{d.consultations[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">{d.consultationNote}</label>
                  <input className="input-field w-full" value={f.consultationNote} onChange={(e) => setF({ ...f, consultationNote: e.target.value })} placeholder={d.consultationNotePh} dir="auto" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button onClick={() => setReturning(true)} className="btn btn-sm">{d.returnForChanges}</button>
                <button onClick={() => act({ action: "DECIDE", ...f }, d.decided)} disabled={!f.opinion.trim()} className="btn btn-primary btn-sm">{d.recordDecision}</button>
              </div>
            </>
          )}
        </div>
      )}

      {closed && (
        <div className="card p-5">
          <div className="flex items-center gap-2"><h3 className="text-[15px] font-bold text-brand-deep">{d.decisionTitle}</h3><StatusBadge status={dpia.statusCode} /></div>
          <dl className="mt-3 grid md:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            <div><dt className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.decidedByLabel}</dt><dd className="text-ink" dir="auto">{dpia.decidedBy ?? dpia.screeningBy ?? "—"} · {day(dpia.decidedAt)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.colNextReview}</dt><dd className="text-ink">{day(dpia.nextReviewDate)}</dd></div>
            {dpia.statusCode === "NOT_REQUIRED"
              ? <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.justification}</dt><dd className="text-ink whitespace-pre-wrap" dir="auto">{dpia.screeningNote ?? "—"}</dd></div>
              : <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.opinion}</dt><dd className="text-ink whitespace-pre-wrap" dir="auto">{dpia.dpoOpinion ?? "—"}</dd></div>}
            {dpia.conditions && <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.conditions}</dt><dd className="text-ink whitespace-pre-wrap" dir="auto">{dpia.conditions}</dd></div>}
            {dpia.statusCode !== "NOT_REQUIRED" && (
              <div className="md:col-span-2"><dt className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.consultation}</dt>
                <dd className="text-ink" dir="auto">{d.consultations[dpia.consultationCode]}{dpia.consultationNote ? ` — ${dpia.consultationNote}` : ""}</dd></div>
            )}
          </dl>
          {dpia.measuresOpen > 0 && <p className="text-[12px] text-amber-800 mt-3">{fill(d.openMeasuresNote, { n: dpia.measuresOpen })} <button onClick={() => goTo("risks")} className="text-brand-purple hover:underline">{d.goThere}</button></p>}
        </div>
      )}

      {returning && <ReasonDialog title={d.returnForChanges} hint={d.returnHint} confirm={d.returnForChanges} onClose={() => setReturning(false)}
        onConfirm={(note) => act({ action: "RETURN", note }, d.returned)} />}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────
function HistoryTab({ dpia, dpiaId, current, onView }: { dpia: DpiaDetail; dpiaId: number; current: number | null; onView: (n: number) => void }) {
  const { t } = useLang();
  const d = t.dpia;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card p-5">
        <h3 className="text-[15px] font-bold text-brand-deep">{d.versionsTitle}</h3>
        <p className="text-[12px] text-muted mt-0.5">{d.versionsDesc}</p>
        {dpia.versions.length === 0 && <p className="text-[13px] text-muted mt-3">{d.noVersions}</p>}
        <div className="mt-2 divide-y divide-line-soft">
          {dpia.versions.map((v) => (
            <div key={v.versionNo} className="py-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-ink">{fill(d.versionN, { n: v.versionNo })} · {(d.statuses as Record<string, string>)[v.decisionCode] ?? v.decisionCode}</div>
                <div className="text-[11px] text-muted" dir="auto">{v.by ?? "—"} · {day(v.at)}</div>
              </div>
              <div className="flex gap-3 text-[12px]">
                {current === v.versionNo ? <span className="text-muted">{d.viewing}</span> : <button onClick={() => onView(v.versionNo)} className="text-brand-purple hover:underline">{d.view}</button>}
                <a href={`/api/privacy/dpia/${dpiaId}/export?version=${v.versionNo}`} className="text-brand-purple hover:underline">PDF</a>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <h3 className="text-[15px] font-bold text-brand-deep">{d.activityTitle}</h3>
        {dpia.events.length === 0 && <p className="text-[13px] text-muted mt-3">{d.noActivity}</p>}
        <ul className="mt-2 space-y-2.5">
          {dpia.events.map((e) => (
            <li key={e.eventId} className="text-[13px]">
              <div className="text-ink">{(d.events as Record<string, string>)[e.code] ?? e.code}</div>
              <div className="text-[11px] text-muted" dir="auto">{e.user ?? "—"} · {e.at.replace("T", " ").slice(0, 16)}</div>
              {e.note && <div className="text-[12px] text-ink-soft bg-canvas-soft rounded px-2 py-1 mt-0.5 whitespace-pre-wrap" dir="auto">{e.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────
function EditDialog({ dpia, users, onClose, act }: { dpia: DpiaDetail; users: Options["users"]; onClose: () => void; act: Act }) {
  const { t } = useLang();
  const d = t.dpia;
  const [f, setF] = useState({ title: dpia.title, description: dpia.description ?? "", ownerUserId: dpia.ownerUserId ?? "" });
  return (
    <Dialog title={d.editTitle} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={async () => { if (await act({ action: "UPDATE", ...f })) onClose(); }} disabled={!f.title.trim()} className="btn btn-primary btn-sm">{t.common.save}</button>
    </>}>
      <div><label className="field-label">{d.fTitle}</label><input className="input-field w-full" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" maxLength={255} /></div>
      <div><label className="field-label">{d.fDescription}</label><textarea className="input-field w-full" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} dir="auto" /></div>
      <div>
        <label className="field-label">{d.fOwner}</label>
        <select className="input-field w-full" value={f.ownerUserId} onChange={(e) => setF({ ...f, ownerUserId: e.target.value })}>
          {users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
        </select>
      </div>
    </Dialog>
  );
}

function ReasonDialog({ title, hint, confirm, onClose, onConfirm }: { title: string; hint: string; confirm: string; onClose: () => void; onConfirm: (note: string) => Promise<boolean> }) {
  const { t } = useLang();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={async () => { if (await onConfirm(note)) onClose(); else setError(t.dpia.failed); }} disabled={!note.trim()} className="btn btn-primary btn-sm">{confirm}</button>
    </>}>
      <p className="text-[13px] text-ink-soft">{hint}</p>
      <textarea className="input-field w-full" rows={3} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" autoFocus />
      <ErrorNote text={error} />
    </Dialog>
  );
}
