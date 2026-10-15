// Editing the impact assessment questionnaires (db/186, db/190). Admins and data
// protection officers only. The texts are written in English, the base language; other
// languages are translated in Languages & Translations (category DPIA_TEMPLATES), where a
// changed English text marks the existing translations stale.
//
// Which questionnaires are used, and the default, is a configuration chosen by an
// administrator (setQuestionnaireUse, Configuration › Privacy & Retention).
//
// Edits apply to assessments that are not yet decided; decided versions are snapshots.
// A question an assessment has answered is retired rather than deleted, so the answer
// stays with that assessment.
import { randomUUID } from "crypto";
import { sql } from "../db";
import { logCreate, logUpdate } from "../audit";
import { upsertKey } from "../i18n-admin/translatable-fields";
import type { SessionUser } from "../types";
import { isDpiaReviewer, type DpiaError } from "./dpia";
import {
  DPIA_ASSESSMENT_AUTO, DPIA_ASSESSMENT_SECTIONS, DPIA_SCREENING_AUTO, type QuestionAdmin, type TemplateAdmin,
} from "./dpia-types";

const AUDIT_TYPE = "DPIA_TEMPLATE";
const CATEGORY = "DPIA_TEMPLATES";
const fail = (code: string, error: string): DpiaError => ({ code, error });
const text = (v: unknown, max = 5000): string | null => { const s = typeof v === "string" ? v.trim() : ""; return s ? s.slice(0, max) : null; };
const tplKey = (id: number, field: "name" | "regulation" | "description") => `dpia_templates.${id}.${field}`;
const qKey = (id: number, field: "text" | "help") => `dpia_template_questions.${id}.${field}`;
type Ok = { ok: true };
const forbidden = () => fail("FORBIDDEN", "Only an admin or a data protection officer can edit the questionnaires.");

/**
 * Keeps a text's translation key in step with its English (the caller saves the column):
 * a new key for the Workbench, a changed base text that marks translations stale, or no
 * key once the text is cleared.
 */
async function saveText(keyCode: string, english: string | null): Promise<void> {
  if (!english) {
    await sql`DELETE FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
    return;
  }
  await upsertKey({ keysCreated: 0, keysUpdatedStale: 0, secondarySeeded: 0 }, CATEGORY, keyCode, english, "en", "ar", null);
}

/** Copies the translations of one key to another (copying a questionnaire). */
async function copyTranslations(fromKey: string, toKey: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
    SELECT nk.key_id, tr.language_code, tr.translated_text, tr.status_code, tr.translated_at, tr.verified_at
    FROM bayanat.translation_keys ok JOIN bayanat.translations tr ON tr.key_id = ok.key_id
    JOIN bayanat.translation_keys nk ON nk.key_code = ${toKey}
    WHERE ok.key_code = ${fromKey}
    ON CONFLICT (key_id, language_code) DO NOTHING
  `;
}

async function touch(templateId: number, userId: string): Promise<void> {
  await sql`UPDATE bayanat.dpia_templates SET updated_at = now(), updated_by_user_id = ${userId} WHERE template_id = ${templateId}`;
}

// ── Reading ──────────────────────────────────────────────────────────────────
const templateCols = () => sql.unsafe(`
  t.template_id AS "templateId", t.template_code AS code, t.template_name_text AS name, t.regulation_text AS regulation,
  t.description_text AS description, t.screening_threshold_int AS threshold, t.is_active_indicator AS "isActive",
  t.is_default_indicator AS "isDefault",
  (SELECT count(*)::int FROM bayanat.dpia_template_questions q WHERE q.template_id = t.template_id AND q.stage_code = 'SCREENING' AND NOT q.is_retired_indicator) AS "screeningCount",
  (SELECT count(*)::int FROM bayanat.dpia_template_questions q WHERE q.template_id = t.template_id AND q.stage_code = 'ASSESSMENT' AND NOT q.is_retired_indicator) AS "assessmentCount",
  (SELECT count(*)::int FROM bayanat.dpias d WHERE d.template_id = t.template_id) AS "dpiaCount",
  (SELECT count(*)::int FROM bayanat.dpias d WHERE d.template_id = t.template_id AND d.status_code IN ('SCREENING', 'ASSESSMENT', 'IN_REVIEW')) AS "openDpiaCount",
  t.updated_at::text AS "updatedAt", coalesce(u.full_name, t.updated_by_user_id) AS "updatedBy",
  t.framework_code AS "frameworkCode",
  (SELECT f.framework_id FROM bayanat.gov_compliance_frameworks f WHERE f.code = t.framework_code) AS "frameworkId",
  (SELECT f.name FROM bayanat.gov_compliance_frameworks f WHERE f.code = t.framework_code) AS "frameworkName",
  (SELECT f.is_applicable_indicator FROM bayanat.gov_compliance_frameworks f WHERE f.code = t.framework_code) AS "frameworkApplicable"
`);

export async function listTemplatesForAdmin(): Promise<TemplateAdmin[]> {
  return sql<TemplateAdmin[]>`
    SELECT ${templateCols()} FROM bayanat.dpia_templates t LEFT JOIN bayanat.users u ON u.user_id = t.updated_by_user_id
    ORDER BY t.is_active_indicator DESC, t.sort_order_int, t.template_id
  `;
}

export async function getTemplateForAdmin(templateId: number): Promise<{ template: TemplateAdmin; questions: QuestionAdmin[] } | null> {
  const [template] = await sql<TemplateAdmin[]>`
    SELECT ${templateCols()} FROM bayanat.dpia_templates t LEFT JOIN bayanat.users u ON u.user_id = t.updated_by_user_id WHERE t.template_id = ${templateId}
  `;
  if (!template) return null;
  const questions = await sql<QuestionAdmin[]>`
    SELECT q.question_id AS "questionId", q.question_code AS code, q.stage_code AS stage, q.section_code AS section,
           q.question_text AS text, q.help_text AS help, q.reference_text AS reference, q.auto_code AS "autoCode",
           q.is_required_indicator AS required, q.is_retired_indicator AS retired,
           (SELECT count(*)::int FROM bayanat.dpia_answers a WHERE a.question_id = q.question_id
              AND (a.answer_code IS NOT NULL OR btrim(coalesce(a.answer_text, '')) <> '')) AS "answeredCount"
    FROM bayanat.dpia_template_questions q WHERE q.template_id = ${templateId}
    ORDER BY q.sort_order_int, q.question_id
  `;
  return { template, questions: [...questions] };
}

// ── Questionnaires ───────────────────────────────────────────────────────────
/** A new questionnaire, empty or as a copy of another one (questions and translations included). */
export async function createTemplate(input: { name?: unknown; copyFromId?: unknown }, session: SessionUser): Promise<{ templateId: number } | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const name = text(input.name, 150);
  if (!name) return fail("NAME_REQUIRED", "A name is required.");
  const fromId = Number(input.copyFromId) || null;
  const [src] = fromId ? await sql<{ regulation: string | null; description: string | null; threshold: number }[]>`
    SELECT regulation_text AS regulation, description_text AS description, screening_threshold_int AS threshold FROM bayanat.dpia_templates WHERE template_id = ${fromId}
  ` : [];
  if (fromId && !src) return fail("NOT_FOUND", "Not found");
  const code = `T_${randomUUID().slice(0, 8).toUpperCase()}`;
  const [row] = await sql<{ templateId: number }[]>`
    INSERT INTO bayanat.dpia_templates (template_code, template_name_text, regulation_text, description_text, screening_threshold_int, is_active_indicator, is_default_indicator, sort_order_int, updated_at, updated_by_user_id)
    VALUES (${code}, ${name}, ${src?.regulation ?? null}, ${src?.description ?? null}, ${src?.threshold ?? 1}, false, false,
            (SELECT coalesce(max(sort_order_int), 0) + 1 FROM bayanat.dpia_templates), now(), ${session.userId})
    RETURNING template_id AS "templateId"
  `;
  const id = row.templateId;
  await saveText(tplKey(id, "name"), name);
  if (fromId && src) {
    if (src.regulation) { await saveText(tplKey(id, "regulation"), src.regulation); await copyTranslations(tplKey(fromId, "regulation"), tplKey(id, "regulation")); }
    if (src.description) { await saveText(tplKey(id, "description"), src.description); await copyTranslations(tplKey(fromId, "description"), tplKey(id, "description")); }
    const qs = await sql<{ questionId: number; code: string; stage: string; section: string; text: string; help: string | null; reference: string | null; autoCode: string | null; required: boolean; sort: number }[]>`
      SELECT question_id AS "questionId", question_code AS code, stage_code AS stage, section_code AS section, question_text AS text, help_text AS help,
             reference_text AS reference, auto_code AS "autoCode", is_required_indicator AS required, sort_order_int AS sort
      FROM bayanat.dpia_template_questions WHERE template_id = ${fromId} AND NOT is_retired_indicator ORDER BY sort_order_int, question_id
    `;
    for (const q of qs) {
      const [n] = await sql<{ questionId: number }[]>`
        INSERT INTO bayanat.dpia_template_questions (template_id, question_code, stage_code, section_code, question_text, help_text, reference_text, auto_code, is_required_indicator, sort_order_int)
        VALUES (${id}, ${q.code}, ${q.stage}, ${q.section}, ${q.text}, ${q.help}, ${q.reference}, ${q.autoCode}, ${q.required}, ${q.sort})
        RETURNING question_id AS "questionId"
      `;
      await saveText(qKey(n.questionId, "text"), q.text);
      await copyTranslations(qKey(q.questionId, "text"), qKey(n.questionId, "text"));
      if (q.help) { await saveText(qKey(n.questionId, "help"), q.help); await copyTranslations(qKey(q.questionId, "help"), qKey(n.questionId, "help")); }
    }
  }
  await logCreate(AUDIT_TYPE, id, session.userId, [{ field: "name", newVal: name }, { field: "copied_from", newVal: fromId ? String(fromId) : null }]);
  return { templateId: id };
}

type TemplateInput = { name?: unknown; regulation?: unknown; description?: unknown; threshold?: unknown };

export async function updateTemplate(templateId: number, input: TemplateInput, session: SessionUser): Promise<Ok | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const cur = (await getTemplateForAdmin(templateId))?.template;
  if (!cur) return fail("NOT_FOUND", "Not found");
  const name = input.name === undefined ? cur.name : text(input.name, 150);
  if (!name) return fail("NAME_REQUIRED", "A name is required.");
  const regulation = input.regulation === undefined ? cur.regulation : text(input.regulation, 300);
  const description = input.description === undefined ? cur.description : text(input.description);
  const threshold = input.threshold === undefined ? cur.threshold : Math.floor(Number(input.threshold));
  if (!Number.isFinite(threshold) || threshold < 1) return fail("THRESHOLD_INVALID", "The threshold must be at least 1.");
  if (cur.screeningCount > 0 && threshold > cur.screeningCount) return fail("THRESHOLD_TOO_HIGH", "The threshold cannot be higher than the number of screening questions.");
  await sql`
    UPDATE bayanat.dpia_templates SET template_name_text = ${name}, regulation_text = ${regulation}, description_text = ${description},
      screening_threshold_int = ${threshold}, updated_at = now(), updated_by_user_id = ${session.userId}
    WHERE template_id = ${templateId}
  `;
  await saveText(tplKey(templateId, "name"), name);
  await saveText(tplKey(templateId, "regulation"), regulation);
  await saveText(tplKey(templateId, "description"), description);
  await logUpdate(AUDIT_TYPE, templateId, session.userId, [
    { field: "name", oldVal: cur.name, newVal: name },
    { field: "regulation", oldVal: cur.regulation, newVal: regulation },
    { field: "description", oldVal: cur.description, newVal: description },
    { field: "threshold", oldVal: String(cur.threshold), newVal: String(threshold) },
  ]);
  return { ok: true };
}

/**
 * The configuration: which questionnaires (that is, which regulations) new assessments
 * are offered, and the one preselected. Administrators only. Assessments already started
 * keep their questionnaire whatever is chosen here.
 */
export async function setQuestionnaireUse(input: { activeIds?: unknown; defaultId?: unknown }, session: SessionUser): Promise<Ok | DpiaError> {
  if (session.role !== "ADMIN") return fail("FORBIDDEN", "Only an administrator can choose the questionnaires in use.");
  const all = await listTemplatesForAdmin();
  const active = [...new Set((Array.isArray(input.activeIds) ? input.activeIds : []).map(Number))].filter((id) => all.some((t) => t.templateId === id));
  const defaultId = Number(input.defaultId);
  if (active.length === 0) return fail("NONE_IN_USE", "Choose at least one questionnaire.");
  if (!active.includes(defaultId)) return fail("DEFAULT_NOT_IN_USE", "The default must be one of the questionnaires in use.");
  const empty = all.find((t) => active.includes(t.templateId) && t.screeningCount === 0);
  if (empty) return fail("NO_SCREENING_QUESTIONS", `“${empty.name}” has no screening question yet, so it cannot be used.`);
  await sql`
    UPDATE bayanat.dpia_templates SET is_active_indicator = (template_id = ANY(${active})), is_default_indicator = (template_id = ${defaultId})
  `;
  for (const t of all) {
    const nowActive = active.includes(t.templateId), nowDefault = t.templateId === defaultId;
    await logUpdate(AUDIT_TYPE, t.templateId, session.userId, [
      { field: "in_use", oldVal: String(t.isActive), newVal: String(nowActive) },
      { field: "default", oldVal: String(t.isDefault), newVal: String(nowDefault) },
    ]);
  }
  return { ok: true };
}

/** Only a questionnaire no assessment has used can be deleted; any other is taken out of use instead. */
export async function deleteTemplate(templateId: number, session: SessionUser): Promise<Ok | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const cur = (await getTemplateForAdmin(templateId))?.template;
  if (!cur) return fail("NOT_FOUND", "Not found");
  if (cur.isActive) return fail("TEMPLATE_ACTIVE", "This questionnaire is in use. Take it out of use in Configuration first.");
  if (cur.dpiaCount > 0) return fail("TEMPLATE_IN_USE", "Assessments use this questionnaire, so it stays; it can be taken out of use in Configuration.");
  const qs = await sql<{ id: number }[]>`SELECT question_id AS id FROM bayanat.dpia_template_questions WHERE template_id = ${templateId}`;
  const keys = [tplKey(templateId, "name"), tplKey(templateId, "regulation"), tplKey(templateId, "description"),
    ...qs.flatMap((q) => [qKey(q.id, "text"), qKey(q.id, "help")])];
  await sql`DELETE FROM bayanat.dpia_templates WHERE template_id = ${templateId}`;
  await sql`DELETE FROM bayanat.translation_keys WHERE key_code = ANY(${keys})`;
  await logUpdate(AUDIT_TYPE, templateId, session.userId, [{ field: "deleted", oldVal: cur.name, newVal: null }]);
  return { ok: true };
}

// ── Questions ────────────────────────────────────────────────────────────────
type QuestionInput = { stage?: unknown; section?: unknown; text?: unknown; help?: unknown; reference?: unknown; autoCode?: unknown; required?: unknown };
type Clean = { stage: "SCREENING" | "ASSESSMENT"; section: string; text: string; help: string | null; reference: string | null; autoCode: string | null; required: boolean };

function clean(input: QuestionInput, cur?: QuestionAdmin): Clean | DpiaError {
  const stage = input.stage === undefined && cur ? cur.stage : input.stage === "SCREENING" || input.stage === "ASSESSMENT" ? input.stage : null;
  if (!stage) return fail("STAGE_INVALID", "Choose whether this is a screening or an assessment question.");
  const sectionIn = input.section === undefined && cur ? cur.section : String(input.section ?? "");
  const section = stage === "SCREENING" ? "SCREENING" : (DPIA_ASSESSMENT_SECTIONS as readonly string[]).includes(sectionIn) ? sectionIn : null;
  if (!section) return fail("SECTION_INVALID", "Choose a section.");
  const body = input.text === undefined && cur ? cur.text : text(input.text);
  if (!body) return fail("TEXT_REQUIRED", "The question needs a text.");
  // A catalog link belongs to its stage: moving the question drops it unless a new one is given.
  const autoIn = input.autoCode === undefined && cur ? (stage === cur.stage ? cur.autoCode : null) : text(input.autoCode, 40);
  const allowed: readonly string[] = stage === "SCREENING" ? DPIA_SCREENING_AUTO : DPIA_ASSESSMENT_AUTO;
  if (autoIn && !allowed.includes(autoIn)) return fail("AUTO_INVALID", "Unknown catalog link.");
  return {
    stage, section, text: body,
    help: input.help === undefined && cur ? cur.help : text(input.help),
    reference: input.reference === undefined && cur ? cur.reference : text(input.reference, 300),
    autoCode: autoIn,
    // Every screening question must be answered; the flag only matters in the assessment.
    required: stage === "ASSESSMENT" && (input.required === undefined && cur ? cur.required : input.required === true),
  };
}

async function question(questionId: number): Promise<(QuestionAdmin & { templateId: number }) | null> {
  const [r] = await sql<{ templateId: number }[]>`SELECT template_id AS "templateId" FROM bayanat.dpia_template_questions WHERE question_id = ${questionId}`;
  if (!r) return null;
  const q = (await getTemplateForAdmin(r.templateId))?.questions.find((x) => x.questionId === questionId);
  return q ? { ...q, templateId: r.templateId } : null;
}

export async function addQuestion(templateId: number, input: QuestionInput, session: SessionUser): Promise<{ questionId: number } | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const [tpl] = await sql`SELECT 1 FROM bayanat.dpia_templates WHERE template_id = ${templateId}`;
  if (!tpl) return fail("NOT_FOUND", "Not found");
  const c = clean(input);
  if ("error" in c) return c;
  const code = `${c.stage === "SCREENING" ? "S" : "A"}_${randomUUID().slice(0, 8).toUpperCase()}`;
  const [row] = await sql<{ questionId: number }[]>`
    INSERT INTO bayanat.dpia_template_questions (template_id, question_code, stage_code, section_code, question_text, help_text, reference_text, auto_code, is_required_indicator, sort_order_int)
    VALUES (${templateId}, ${code}, ${c.stage}, ${c.section}, ${c.text}, ${c.help}, ${c.reference}, ${c.autoCode}, ${c.required},
            (SELECT coalesce(max(sort_order_int), 0) + 1 FROM bayanat.dpia_template_questions WHERE template_id = ${templateId}))
    RETURNING question_id AS "questionId"
  `;
  await saveText(qKey(row.questionId, "text"), c.text);
  await saveText(qKey(row.questionId, "help"), c.help);
  await touch(templateId, session.userId);
  await logUpdate(AUDIT_TYPE, templateId, session.userId, [{ field: `question.${code}`, oldVal: null, newVal: c.text }]);
  return { questionId: row.questionId };
}

export async function updateQuestion(questionId: number, input: QuestionInput, session: SessionUser): Promise<Ok | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const cur = await question(questionId);
  if (!cur) return fail("NOT_FOUND", "Not found");
  // A Yes/No answer cannot become a written one, or the other way round.
  if (input.stage !== undefined && input.stage !== cur.stage && cur.answeredCount > 0) return fail("STAGE_LOCKED", "Assessments have answered this question, so it stays in its stage.");
  const c = clean(input, cur);
  if ("error" in c) return c;
  if (c.stage !== cur.stage && cur.stage === "SCREENING") {
    const [{ n, threshold }] = await sql<{ n: number; threshold: number }[]>`
      SELECT (SELECT count(*)::int FROM bayanat.dpia_template_questions WHERE template_id = ${cur.templateId} AND stage_code = 'SCREENING' AND NOT is_retired_indicator) AS n,
             (SELECT screening_threshold_int FROM bayanat.dpia_templates WHERE template_id = ${cur.templateId}) AS threshold
    `;
    if (n - 1 < threshold) return fail("THRESHOLD_TOO_HIGH", "Lower the screening threshold first: it would be higher than the number of screening questions.");
  }
  await sql`
    UPDATE bayanat.dpia_template_questions SET stage_code = ${c.stage}, section_code = ${c.section}, question_text = ${c.text}, help_text = ${c.help},
      reference_text = ${c.reference}, auto_code = ${c.autoCode}, is_required_indicator = ${c.required}
    WHERE question_id = ${questionId}
  `;
  await saveText(qKey(questionId, "text"), c.text);
  await saveText(qKey(questionId, "help"), c.help);
  await touch(cur.templateId, session.userId);
  await logUpdate(AUDIT_TYPE, cur.templateId, session.userId, [
    { field: `question.${cur.code}.text`, oldVal: cur.text, newVal: c.text },
    { field: `question.${cur.code}.help`, oldVal: cur.help, newVal: c.help },
    { field: `question.${cur.code}.stage`, oldVal: `${cur.stage}/${cur.section}`, newVal: `${c.stage}/${c.section}` },
    { field: `question.${cur.code}.reference`, oldVal: cur.reference, newVal: c.reference },
    { field: `question.${cur.code}.catalog_link`, oldVal: cur.autoCode, newVal: c.autoCode },
    { field: `question.${cur.code}.required`, oldVal: String(cur.required), newVal: String(c.required) },
  ]);
  return { ok: true };
}

/** Deletes a question nobody has answered; retires one that has been answered. */
export async function removeQuestion(questionId: number, session: SessionUser): Promise<{ ok: true; retired: boolean } | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const cur = await question(questionId);
  if (!cur) return fail("NOT_FOUND", "Not found");
  if (cur.stage === "SCREENING" && !cur.retired) {
    const [{ n, threshold }] = await sql<{ n: number; threshold: number }[]>`
      SELECT (SELECT count(*)::int FROM bayanat.dpia_template_questions WHERE template_id = ${cur.templateId} AND stage_code = 'SCREENING' AND NOT is_retired_indicator) AS n,
             (SELECT screening_threshold_int FROM bayanat.dpia_templates WHERE template_id = ${cur.templateId}) AS threshold
    `;
    if (n - 1 < threshold) return fail("THRESHOLD_TOO_HIGH", "Lower the screening threshold first: it would be higher than the number of screening questions.");
  }
  const retired = cur.answeredCount > 0;
  if (retired) {
    await sql`UPDATE bayanat.dpia_template_questions SET is_retired_indicator = true WHERE question_id = ${questionId}`;
  } else {
    // Empty answer rows (a cleared field) go with it.
    await sql`DELETE FROM bayanat.dpia_template_questions WHERE question_id = ${questionId}`;
    await sql`DELETE FROM bayanat.translation_keys WHERE key_code = ANY(${[qKey(questionId, "text"), qKey(questionId, "help")]})`;
  }
  await touch(cur.templateId, session.userId);
  await logUpdate(AUDIT_TYPE, cur.templateId, session.userId, [{ field: `question.${cur.code}`, oldVal: cur.text, newVal: retired ? "(retired)" : null }]);
  return { ok: true, retired };
}

export async function restoreQuestion(questionId: number, session: SessionUser): Promise<Ok | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const cur = await question(questionId);
  if (!cur) return fail("NOT_FOUND", "Not found");
  await sql`UPDATE bayanat.dpia_template_questions SET is_retired_indicator = false WHERE question_id = ${questionId}`;
  await touch(cur.templateId, session.userId);
  await logUpdate(AUDIT_TYPE, cur.templateId, session.userId, [{ field: `question.${cur.code}`, oldVal: "(retired)", newVal: cur.text }]);
  return { ok: true };
}

/** Moves a question one place up or down among the questions of its stage and section. */
export async function moveQuestion(questionId: number, direction: unknown, session: SessionUser): Promise<Ok | DpiaError> {
  if (!isDpiaReviewer(session.role)) return forbidden();
  const cur = await question(questionId);
  if (!cur) return fail("NOT_FOUND", "Not found");
  const peers = await sql<{ id: number; sort: number }[]>`
    SELECT question_id AS id, sort_order_int AS sort FROM bayanat.dpia_template_questions
    WHERE template_id = ${cur.templateId} AND stage_code = ${cur.stage} AND section_code = ${cur.section} AND NOT is_retired_indicator
    ORDER BY sort_order_int, question_id
  `;
  const i = peers.findIndex((p) => p.id === questionId);
  const j = direction === "UP" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= peers.length) return { ok: true };
  // Renumber the group in its new order, inside the sort range it already occupies.
  const order = [...peers];
  [order[i], order[j]] = [order[j], order[i]];
  const slots = peers.map((p) => p.sort).sort((a, b) => a - b);
  const distinct = new Set(slots).size === slots.length;
  for (const [k, p] of order.entries()) {
    const sort = distinct ? slots[k] : slots[0] + k;
    await sql`UPDATE bayanat.dpia_template_questions SET sort_order_int = ${sort} WHERE question_id = ${p.id}`;
  }
  await touch(cur.templateId, session.userId);
  return { ok: true };
}
