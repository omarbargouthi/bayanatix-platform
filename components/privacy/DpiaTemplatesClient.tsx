"use client";

// Editing the impact assessment questionnaires: their names, screening threshold, and
// their screening and assessment questions. Admins and data protection officers only.
// Texts are written in English; other languages are translated in Languages &
// Translations, and which questionnaires are used is chosen in Configuration.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import {
  DPIA_ASSESSMENT_AUTO, DPIA_ASSESSMENT_SECTIONS, DPIA_SCREENING_AUTO, type QuestionAdmin, type TemplateAdmin,
} from "@/lib/privacy/dpia-types";
import { Dialog, ErrorNote, day, fill } from "./dpia-ui";

type Detail = { template: TemplateAdmin; questions: QuestionAdmin[] };

const errorText = (t: I18nStrings, res: { code?: string; error?: string }) =>
  (t.dpiaTemplates.errors as Record<string, string>)[res.code ?? ""] ?? (t.dpia.errors as Record<string, string>)[res.code ?? ""] ?? res.error ?? t.dpia.failed;

async function send(url: string, method: string, body?: object): Promise<{ ok: boolean; res: Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, res: await r.json().catch(() => ({})) };
}

/** The label of a question's catalog link, in the reader's language. */
function autoLabel(t: I18nStrings, stage: string, code: string | null): string | null {
  if (!code) return null;
  return stage === "SCREENING" ? (t.dpiaTemplates.autoFlags as Record<string, string>)[code] ?? code : (t.dpia.facts.blocks as Record<string, string>)[code] ?? code;
}

export function DpiaTemplatesClient({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useLang();
  const w = t.dpiaTemplates;
  const [templates, setTemplates] = useState<TemplateAdmin[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const loadList = useCallback(async () => {
    const r = await fetch("/api/privacy/dpia/templates");
    const list: TemplateAdmin[] = r.ok ? await r.json() : [];
    setTemplates(list);
    setSelected((s) => (s && list.some((x) => x.templateId === s) ? s : list[0]?.templateId ?? null));
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  return (
    <main className="px-8 py-7 pb-14 space-y-4">
      <Link href="/privacy/dpia" className="text-[13px] text-brand-purple hover:underline">{t.dpia.back}</Link>
      <div className="card p-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-brand-deep">{w.title}</h1>
          <p className="text-[13px] text-muted mt-1 max-w-4xl">{w.desc} {w.editNote}</p>
          <p className="text-[12px] text-muted mt-2 max-w-4xl">
            {w.translationsNote}
            {isAdmin && <> <Link href="/admin/languages?tab=Workbench&category=DPIA_TEMPLATES" className="text-brand-purple hover:underline">{w.translationsLink}</Link></>}
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm shrink-0">{w.newTemplate}</button>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        <div className="space-y-2">
          {templates?.map((x) => (
            <button key={x.templateId} onClick={() => setSelected(x.templateId)}
              className={`card p-4 w-full text-start transition-colors ${selected === x.templateId ? "ring-2 ring-brand-purple" : "hover:bg-canvas-soft/60"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-semibold text-ink" dir="auto">{x.name}</span>
                {x.isDefault && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-purple bg-brand-purple/10 rounded px-1.5 py-0.5">{w.badgeDefault}</span>}
                {!x.isActive && <span className="text-[10px] font-bold uppercase tracking-wider text-muted bg-canvas-soft rounded px-1.5 py-0.5">{w.badgeInactive}</span>}
              </div>
              {x.regulation && <div className="text-[12px] text-muted mt-0.5" dir="auto">{x.regulation}</div>}
              <div className="text-[11px] text-muted mt-1">{fill(w.counts, { s: x.screeningCount, a: x.assessmentCount })}</div>
            </button>
          ))}
        </div>
        {selected != null && <TemplateEditor key={selected} templateId={selected} isAdmin={isAdmin} onListChanged={loadList} />}
      </div>

      {creating && templates && <NewTemplateDialog templates={templates} onClose={() => setCreating(false)}
        onCreated={async (id) => { setCreating(false); await loadList(); setSelected(id); }} />}
    </main>
  );
}

// ── One questionnaire ────────────────────────────────────────────────────────
function TemplateEditor({ templateId, isAdmin, onListChanged }: { templateId: number; isAdmin: boolean; onListChanged: () => void }) {
  const { t } = useLang();
  const w = t.dpiaTemplates;
  const [data, setData] = useState<Detail | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<QuestionAdmin | "new-SCREENING" | "new-ASSESSMENT" | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/privacy/dpia/templates/${templateId}`);
    if (r.ok) setData(await r.json());
  }, [templateId]);
  useEffect(() => { load(); }, [load]);

  const run = async (url: string, method: string, body: object | undefined, okText?: string | ((res: Record<string, unknown>) => string)) => {
    setMessage(null);
    const r = await send(url, method, body);
    if (!r.ok) { setMessage({ kind: "err", text: errorText(t, r.res) }); return false; }
    if (okText) setMessage({ kind: "ok", text: typeof okText === "function" ? okText(r.res) : okText });
    await load(); onListChanged();
    return true;
  };

  if (!data) return <div className="card p-10 text-center text-sm text-muted">{t.dpia.loading}</div>;
  const { template, questions } = data;
  const qUrl = (id: number) => `/api/privacy/dpia/templates/${templateId}/questions/${id}`;
  const rowProps = {
    onEdit: (q: QuestionAdmin) => setEditing(q),
    onMove: (q: QuestionAdmin, direction: "UP" | "DOWN") => run(qUrl(q.questionId), "PATCH", { action: "MOVE", direction }),
    onRemove: (q: QuestionAdmin) => {
      if (!window.confirm(w.removeConfirm)) return;
      run(qUrl(q.questionId), "DELETE", undefined, (res) => (res.retired ? w.retired : w.removed));
    },
    onRestore: (q: QuestionAdmin) => run(qUrl(q.questionId), "PATCH", { action: "RESTORE" }),
  };
  const live = questions.filter((q) => !q.retired);
  const retired = questions.filter((q) => q.retired);
  const screening = live.filter((q) => q.stage === "SCREENING");

  return (
    <div className="space-y-4 min-w-0">
      {message && (
        <div className={`text-[13px] rounded-md px-4 py-2.5 border flex justify-between ${message.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
          <span>{message.text}</span><button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      <DetailsCard template={template} isAdmin={isAdmin} save={(body) => run(`/api/privacy/dpia/templates/${templateId}`, "PATCH", body, w.saved)}
        remove={async () => {
          if (!window.confirm(w.deleteConfirm)) return;
          const r = await send(`/api/privacy/dpia/templates/${templateId}`, "DELETE");
          if (r.ok) onListChanged(); else setMessage({ kind: "err", text: errorText(t, r.res) });
        }} />

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-brand-deep">{w.screeningTitle}</h3>
            <p className="text-[12px] text-muted mt-0.5">{w.screeningDesc}</p>
          </div>
          <button onClick={() => setEditing("new-SCREENING")} className="btn btn-sm shrink-0">{w.addQuestion}</button>
        </div>
        <QuestionList items={screening} {...rowProps} />
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-brand-deep">{w.assessmentTitle}</h3>
            <p className="text-[12px] text-muted mt-0.5">{w.assessmentDesc}</p>
          </div>
          <button onClick={() => setEditing("new-ASSESSMENT")} className="btn btn-sm shrink-0">{w.addQuestion}</button>
        </div>
        {DPIA_ASSESSMENT_SECTIONS.map((s) => (
          <div key={s} className="mt-4">
            <div className="text-[12px] font-bold uppercase tracking-wider text-muted">{t.dpia.sections[s]}</div>
            <QuestionList items={live.filter((q) => q.stage === "ASSESSMENT" && q.section === s)} {...rowProps} />
          </div>
        ))}
      </div>

      {retired.length > 0 && (
        <div className="card p-5">
          <h3 className="text-[15px] font-bold text-brand-deep">{w.retiredTitle}</h3>
          <QuestionList items={retired} {...rowProps} />
        </div>
      )}

      {editing && (
        <QuestionDialog
          question={typeof editing === "string" ? null : editing}
          stage={typeof editing === "string" ? (editing === "new-SCREENING" ? "SCREENING" : "ASSESSMENT") : editing.stage}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const r = typeof editing === "string"
              ? await send(`/api/privacy/dpia/templates/${templateId}/questions`, "POST", body)
              : await send(qUrl(editing.questionId), "PATCH", body);
            if (!r.ok) return errorText(t, r.res);
            setEditing(null); setMessage({ kind: "ok", text: w.saved });
            await load(); onListChanged();
            return null;
          }} />
      )}
    </div>
  );
}

/** A text in English, the base language. */
function TextField({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const Field = multiline ? "textarea" : "input";
  return (
    <div>
      <label className="field-label">{label}</label>
      <Field className="input-field w-full" rows={multiline ? 3 : undefined} value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" lang="en" />
    </div>
  );
}

function DetailsCard({ template, isAdmin, save, remove }: { template: TemplateAdmin; isAdmin: boolean; save: (body: object) => Promise<boolean>; remove: () => void }) {
  const { t } = useLang();
  const w = t.dpiaTemplates;
  const [f, setF] = useState({ name: template.name, regulation: template.regulation ?? "", description: template.description ?? "", threshold: String(template.threshold) });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit() {
    setBusy(true);
    await save({ name: f.name, regulation: f.regulation, description: f.description, threshold: Number(f.threshold) });
    setBusy(false);
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <span className={`font-semibold rounded-full px-2 py-0.5 ${template.isActive ? "text-emerald-700 bg-emerald-50" : "text-muted bg-canvas-soft"}`}>{template.isActive ? w.statusInUse : w.badgeInactive}</span>
        {template.isDefault && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-purple bg-brand-purple/10 rounded px-1.5 py-0.5">{w.badgeDefault}</span>}
        <span className="text-muted">
          {w.useNote}
          {isAdmin && <> <Link href="/admin/configuration" className="text-brand-purple hover:underline">{w.useLink}</Link></>}
        </span>
      </div>
      <TextField label={w.fName} value={f.name} onChange={set("name")} />
      <TextField label={w.fRegulation} value={f.regulation} onChange={set("regulation")} />
      <TextField label={w.fDescription} value={f.description} onChange={set("description")} multiline />
      <div className="grid md:grid-cols-[200px_1fr] gap-4 items-start">
        <div>
          <label className="field-label">{w.fThreshold}</label>
          <input type="number" min={1} max={Math.max(1, template.screeningCount)} className="input-field w-24" value={f.threshold} onChange={(e) => set("threshold")(e.target.value)} />
        </div>
        <p className="text-[12px] text-muted md:pt-6">{w.thresholdHint}</p>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-line-soft">
        <div className="text-[11px] text-muted pt-2">
          {template.dpiaCount ? fill(w.usedBy, { n: template.dpiaCount, open: template.openDpiaCount }) : w.notUsed}
          {template.updatedAt && <> · {fill(w.updated, { user: template.updatedBy ?? "—", date: day(template.updatedAt) })}</>}
        </div>
        <div className="flex gap-2 pt-2">
          {template.dpiaCount === 0 && !template.isActive && <button onClick={remove} className="btn btn-sm text-red-600">{w.deleteTemplate}</button>}
          <button onClick={submit} disabled={busy || !f.name.trim()} className="btn btn-primary btn-sm">{busy ? t.common.saving : t.common.save}</button>
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  onEdit: (q: QuestionAdmin) => void; onMove: (q: QuestionAdmin, d: "UP" | "DOWN") => void;
  onRemove: (q: QuestionAdmin) => void; onRestore: (q: QuestionAdmin) => void;
};

function QuestionList({ items, onEdit, onMove, onRemove, onRestore }: { items: QuestionAdmin[] } & RowProps) {
  const { t } = useLang();
  const w = t.dpiaTemplates;
  if (!items.length) return <p className="text-[13px] text-muted py-2">{w.noQuestions}</p>;
  return (
    <ol className="mt-2 divide-y divide-line-soft">
      {items.map((q, i) => {
        const auto = autoLabel(t, q.stage, q.autoCode);
        return (
          <li key={q.questionId} className={`py-2.5 flex items-start gap-3 ${q.retired ? "opacity-70" : ""}`}>
            <span className="text-[12px] text-muted w-5 shrink-0 pt-0.5">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink" dir="ltr" lang="en">{q.text}</div>
              {q.help && <div className="text-[12px] text-muted mt-0.5" dir="ltr" lang="en">{q.help}</div>}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {q.required && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-purple bg-brand-purple/10 rounded px-1.5 py-0.5">{w.required}</span>}
                {auto && <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{fill(q.stage === "SCREENING" ? w.catalogSuggests : w.catalogShows, { what: auto })}</span>}
                {q.reference && <span className="text-[11px] text-muted bg-canvas-soft rounded-full px-2 py-0.5" dir="auto">{q.reference}</span>}
                {q.answeredCount > 0 && <span className="text-[11px] text-muted">{fill(w.answeredN, { n: q.answeredCount })}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {q.retired ? <button onClick={() => onRestore(q)} className="btn btn-sm">{w.restore}</button> : <>
                <button onClick={() => onMove(q, "UP")} disabled={i === 0} aria-label={w.up} title={w.up} className="btn btn-sm px-2">↑</button>
                <button onClick={() => onMove(q, "DOWN")} disabled={i === items.length - 1} aria-label={w.down} title={w.down} className="btn btn-sm px-2">↓</button>
                <button onClick={() => onEdit(q)} className="btn btn-sm">{t.common.edit}</button>
                <button onClick={() => onRemove(q)} className="btn btn-sm text-red-600">{w.remove}</button>
              </>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function QuestionDialog({ question, stage: initialStage, onClose, onSave }: {
  question: QuestionAdmin | null; stage: "SCREENING" | "ASSESSMENT"; onClose: () => void; onSave: (body: object) => Promise<string | null>;
}) {
  const { t } = useLang();
  const w = t.dpiaTemplates;
  const initial = {
    stage: initialStage, section: question?.stage === "ASSESSMENT" ? question.section : "DESCRIPTION",
    text: question?.text ?? "", help: question?.help ?? "",
    reference: question?.reference ?? "", autoCode: question?.autoCode ?? "", required: question?.required ?? false,
  };
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !!question && question.answeredCount > 0;
  const autoOptions: readonly string[] = f.stage === "SCREENING" ? DPIA_SCREENING_AUTO : DPIA_ASSESSMENT_AUTO;

  async function submit() {
    setBusy(true); setError(null);
    const body: Record<string, unknown> = {
      stage: f.stage, section: f.section, text: f.text, help: f.help, reference: f.reference, autoCode: f.autoCode || null, required: f.required,
    };
    setError(await onSave(body));
    setBusy(false);
  }

  return (
    <Dialog wide title={question ? w.editQuestion : w.newQuestion} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={submit} disabled={busy || !f.text.trim()} className="btn btn-primary btn-sm">{busy ? t.common.saving : t.common.save}</button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{w.fStage}</label>
          <select className="input-field w-full" value={f.stage} disabled={locked}
            onChange={(e) => setF({ ...f, stage: e.target.value as "SCREENING" | "ASSESSMENT", autoCode: "", required: false })}>
            <option value="SCREENING">{w.stages.SCREENING}</option>
            <option value="ASSESSMENT">{w.stages.ASSESSMENT}</option>
          </select>
          {locked && <p className="text-[11px] text-muted mt-1">{w.stageLockedNote}</p>}
        </div>
        {f.stage === "ASSESSMENT" && (
          <div>
            <label className="field-label">{w.fSection}</label>
            <select className="input-field w-full" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
              {DPIA_ASSESSMENT_SECTIONS.map((s) => <option key={s} value={s}>{t.dpia.sections[s]}</option>)}
            </select>
          </div>
        )}
      </div>
      <TextField label={w.fText} value={f.text} onChange={(v) => setF({ ...f, text: v })} multiline />
      <TextField label={w.fHelp} value={f.help} onChange={(v) => setF({ ...f, help: v })} multiline />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{w.fReference}</label>
          <input className="input-field w-full" value={f.reference} maxLength={300} onChange={(e) => setF({ ...f, reference: e.target.value })} dir="auto" />
        </div>
        <div>
          <label className="field-label">{w.fAuto}</label>
          <select className="input-field w-full" value={f.autoCode} onChange={(e) => setF({ ...f, autoCode: e.target.value })}>
            <option value="">{w.autoNone}</option>
            {autoOptions.map((c) => <option key={c} value={c}>{autoLabel(t, f.stage, c)}</option>)}
          </select>
          <p className="text-[11px] text-muted mt-1">{f.stage === "SCREENING" ? w.autoHintScreening : w.autoHintAssessment}</p>
        </div>
      </div>
      {f.stage === "ASSESSMENT" && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />{w.fRequired}
        </label>
      )}
      <ErrorNote text={error} />
    </Dialog>
  );
}

function NewTemplateDialog({ templates, onClose, onCreated }: { templates: TemplateAdmin[]; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useLang();
  const w = t.dpiaTemplates;
  const [name, setName] = useState("");
  const [from, setFrom] = useState(String(templates.find((x) => x.isDefault)?.templateId ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    const r = await send("/api/privacy/dpia/templates", "POST", { name, copyFromId: from ? Number(from) : null });
    setBusy(false);
    if (r.ok) onCreated(Number(r.res.templateId)); else setError(errorText(t, r.res));
  }
  return (
    <Dialog title={w.newTitle} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={submit} disabled={busy || !name.trim()} className="btn btn-primary btn-sm">{w.create}</button>
    </>}>
      <TextField label={w.fName} value={name} onChange={setName} />
      <div>
        <label className="field-label">{w.startFrom}</label>
        <select className="input-field w-full" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">{w.startEmpty}</option>
          {templates.map((x) => <option key={x.templateId} value={x.templateId}>{fill(w.copyOf, { name: x.name })}</option>)}
        </select>
      </div>
      <p className="text-[12px] text-muted">{w.newHint}</p>
      <ErrorNote text={error} />
    </Dialog>
  );
}
