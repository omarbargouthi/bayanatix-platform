// Data protection impact assessments (db/186): screening, the assessment itself, risks
// and measures, the review decision, and the register of all of them. Every decision
// freezes a version, so the register shows what was approved, not what the record says now.
import { sql } from "../db";
import { translatedColumnSql } from "../i18n-admin/translated-column";
import { createNotification } from "../queries/notifications";
import type { SessionUser } from "../types";
import { buildDpiaFacts, describeAssets, type AssetRef } from "./dpia-facts";
import {
  isClosed, overallResidual, screeningRecommendation, CONSULTATION_CODES, MEASURE_STATUSES,
  type ConsultationCode, type DpiaDetail, type DpiaEvent, type DpiaFacts, type DpiaMeasure, type DpiaPermissions, type DpiaQuestion,
  type DpiaRisk, type DpiaStatus, type DpiaSummary, type DpiaTemplate, type DpiaVersionInfo, type MeasureStatus, type RiskLevel,
} from "./dpia-types";

export type DpiaError = { error: string; code: string };
const fail = (code: string, error: string): DpiaError => ({ code, error });
const ASSET_TYPES = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"];
const validAssetType = (t: string) => ASSET_TYPES.includes(t) || /^CUSTOM:[A-Z0-9_]{1,30}$/.test(t);
const text = (v: unknown, max = 20000): string | null => { const s = typeof v === "string" ? v.trim() : ""; return s ? s.slice(0, max) : null; };
const score = (v: unknown): number | null => { const n = Number(v); return n === 1 || n === 2 || n === 3 ? n : null; };
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const levelOf = (s: number | null): RiskLevel | null => (s == null ? null : s >= 6 ? "HIGH" : s >= 3 ? "MEDIUM" : "LOW");

// ── Who may do what ──────────────────────────────────────────────────────────
/** Admins, data protection officers and stewards see the whole register. */
export const seesAllDpias = (role: string) => role === "ADMIN" || role === "OFFICER" || role === "STEWARD";
export const canCreateDpia = (role: string) => role === "ADMIN" || role === "OFFICER" || role === "STEWARD";
const isReviewer = (role: string) => role === "ADMIN" || role === "OFFICER";

export function dpiaPermissions(session: SessionUser, d: Pick<DpiaSummary, "statusCode" | "ownerUserId" | "createdByUserId" | "versionNo">): DpiaPermissions {
  const mine = d.ownerUserId === session.userId || d.createdByUserId === session.userId;
  const author = isReviewer(session.role) || mine;
  return {
    canEdit: author && (d.statusCode === "SCREENING" || d.statusCode === "ASSESSMENT"),
    canReview: isReviewer(session.role) && d.statusCode === "IN_REVIEW",
    canOverrideScreening: isReviewer(session.role),
    canDelete: isReviewer(session.role) && d.versionNo === 0,
    canReopen: author && isClosed(d.statusCode),
    isAuthor: author,
    userId: session.userId,
  };
}

// ── Templates ────────────────────────────────────────────────────────────────
const templateCols = () => sql.unsafe(`
  t.template_id AS "templateId", t.template_code AS code, t.template_name_text AS name, t.regulation_text AS regulation,
  t.description_text AS description, t.screening_threshold_int AS threshold, t.is_default_indicator AS "isDefault",
  ${translatedColumnSql("'dpia_templates.' || t.template_id || '.name'", "nameTranslations")},
  ${translatedColumnSql("'dpia_templates.' || t.template_id || '.regulation'", "regulationTranslations")},
  ${translatedColumnSql("'dpia_templates.' || t.template_id || '.description'", "descriptionTranslations")}
`);

export async function listDpiaTemplates(): Promise<DpiaTemplate[]> {
  return sql<DpiaTemplate[]>`SELECT ${templateCols()} FROM bayanat.dpia_templates t WHERE t.is_active_indicator ORDER BY t.sort_order_int, t.template_id`;
}

// ── Register ─────────────────────────────────────────────────────────────────
type SummaryRow = Omit<DpiaSummary, "subject" | "inherentLevel" | "residualLevel"> & {
  subjectType: string | null; subjectId: number | null; inherentScore: number | null; residualScore: number | null;
};
const summaryCols = () => sql.unsafe(`
  d.dpia_id AS "dpiaId", d.reference_code AS "referenceCode", d.title_text AS title, t.template_name_text AS "templateName",
  ${translatedColumnSql("'dpia_templates.' || t.template_id || '.name'", "templateNameTranslations")},
  d.status_code AS "statusCode", d.screening_outcome_code AS "screeningOutcome",
  d.owner_user_id AS "ownerUserId", ou.full_name AS "ownerName", d.created_by_user_id AS "createdByUserId",
  (SELECT max(r.inherent_likelihood * r.inherent_severity)::int FROM bayanat.dpia_risks r WHERE r.dpia_id = d.dpia_id) AS "inherentScore",
  (SELECT max(coalesce(r.residual_likelihood * r.residual_severity, r.inherent_likelihood * r.inherent_severity))::int FROM bayanat.dpia_risks r WHERE r.dpia_id = d.dpia_id) AS "residualScore",
  (SELECT count(*)::int FROM bayanat.dpia_measures m WHERE m.dpia_id = d.dpia_id AND m.status_code <> 'CANCELLED') AS "measuresTotal",
  (SELECT count(*)::int FROM bayanat.dpia_measures m WHERE m.dpia_id = d.dpia_id AND m.status_code IN ('PLANNED', 'IN_PROGRESS')) AS "measuresOpen",
  (SELECT count(*)::int FROM bayanat.dpia_measures m WHERE m.dpia_id = d.dpia_id AND m.status_code IN ('PLANNED', 'IN_PROGRESS') AND m.due_date < CURRENT_DATE) AS "measuresOverdue",
  d.decided_at::text AS "decidedAt", du.full_name AS "decidedBy", d.next_review_date::text AS "nextReviewDate",
  (d.status_code IN ('APPROVED', 'APPROVED_WITH_CONDITIONS') AND d.next_review_date IS NOT NULL AND d.next_review_date <= CURRENT_DATE) AS "reviewDue",
  d.version_no AS "versionNo", d.created_at::text AS "createdAt", d.updated_at::text AS "updatedAt",
  sa.asset_type_code AS "subjectType", sa.asset_id AS "subjectId"
`);
const SUMMARY_FROM = sql`
  FROM bayanat.dpias d
  JOIN bayanat.dpia_templates t ON t.template_id = d.template_id
  LEFT JOIN bayanat.users ou ON ou.user_id = d.owner_user_id
  LEFT JOIN bayanat.users du ON du.user_id = d.decided_by_user_id
  LEFT JOIN LATERAL (SELECT asset_type_code, asset_id FROM bayanat.dpia_assets x WHERE x.dpia_id = d.dpia_id ORDER BY x.is_subject_indicator DESC, x.added_at LIMIT 1) sa ON true
`;

async function withSubjects(rows: SummaryRow[]): Promise<DpiaSummary[]> {
  const refs = rows.filter((r) => r.subjectType && r.subjectId != null).map((r) => ({ typeCode: r.subjectType!, id: Number(r.subjectId), isSubject: true }));
  const described = await describeAssets(refs);
  return rows.map(({ subjectType, subjectId, inherentScore, residualScore, ...r }) => {
    const s = described.find((a) => a.typeCode === subjectType && a.id === Number(subjectId));
    return {
      ...r, inherentLevel: levelOf(inherentScore), residualLevel: levelOf(residualScore),
      subject: s ? { typeCode: s.typeCode, id: s.id, name: s.name, typeName: s.typeName } : null,
    };
  });
}

export async function listDpias(session: SessionUser): Promise<DpiaSummary[]> {
  const all = seesAllDpias(session.role);
  const rows = await sql<SummaryRow[]>`
    SELECT ${summaryCols()} ${SUMMARY_FROM}
    WHERE ${all} OR d.owner_user_id = ${session.userId} OR d.created_by_user_id = ${session.userId}
       OR EXISTS (SELECT 1 FROM bayanat.dpia_measures m WHERE m.dpia_id = d.dpia_id AND m.owner_user_id = ${session.userId})
    ORDER BY (d.status_code IN ('NOT_REQUIRED', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED')), d.updated_at DESC
  `;
  return withSubjects(rows);
}

/** The assessments an asset is part of, for the asset's own page. */
export async function listDpiasForAsset(session: SessionUser, typeCode: string, assetId: number): Promise<DpiaSummary[]> {
  const all = seesAllDpias(session.role);
  const rows = await sql<SummaryRow[]>`
    SELECT ${summaryCols()} ${SUMMARY_FROM}
    WHERE EXISTS (SELECT 1 FROM bayanat.dpia_assets a WHERE a.dpia_id = d.dpia_id AND a.asset_type_code = ${typeCode} AND a.asset_id = ${assetId})
      AND (${all} OR d.owner_user_id = ${session.userId} OR d.created_by_user_id = ${session.userId})
    ORDER BY d.updated_at DESC
  `;
  return withSubjects(rows);
}

export async function canViewDpia(session: SessionUser, dpiaId: number): Promise<boolean> {
  if (seesAllDpias(session.role)) return true;
  const [r] = await sql<{ ok: boolean }[]>`
    SELECT true AS ok FROM bayanat.dpias d WHERE d.dpia_id = ${dpiaId}
      AND (d.owner_user_id = ${session.userId} OR d.created_by_user_id = ${session.userId}
        OR EXISTS (SELECT 1 FROM bayanat.dpia_measures m WHERE m.dpia_id = d.dpia_id AND m.owner_user_id = ${session.userId}))
  `;
  return !!r;
}

const questionCols = () => sql.unsafe(`
  q.question_id AS "questionId", q.question_code AS code, q.stage_code AS stage, q.section_code AS section, q.question_text AS text,
  q.help_text AS help, q.reference_text AS reference, q.auto_code AS "autoCode", q.is_required_indicator AS required,
  ${translatedColumnSql("'dpia_template_questions.' || q.question_id || '.text'", "textTranslations")},
  ${translatedColumnSql("'dpia_template_questions.' || q.question_id || '.help'", "helpTranslations")}
`);

export async function getDpia(dpiaId: number): Promise<DpiaDetail | null> {
  const [row] = await sql<SummaryRow[]>`SELECT ${summaryCols()} ${SUMMARY_FROM} WHERE d.dpia_id = ${dpiaId}`;
  if (!row) return null;
  const [summary] = await withSubjects([row]);
  const [extra] = await sql<{
    description: string | null; templateId: number; screeningNote: string | null; screeningBy: string | null; screeningAt: string | null;
    submittedBy: string | null; submittedAt: string | null; dpoOpinion: string | null; conditions: string | null;
    consultationCode: ConsultationCode; consultationNote: string | null; facts: DpiaFacts | null; factsAt: string | null;
  }[]>`
    SELECT d.description_text AS description, d.template_id AS "templateId", d.screening_note_text AS "screeningNote", su.full_name AS "screeningBy",
           d.screening_at::text AS "screeningAt", sb.full_name AS "submittedBy", d.submitted_at::text AS "submittedAt",
           d.dpo_opinion_text AS "dpoOpinion", d.conditions_text AS conditions, d.consultation_code AS "consultationCode",
           d.consultation_note_text AS "consultationNote", d.facts_json AS facts, d.facts_at::text AS "factsAt"
    FROM bayanat.dpias d
    LEFT JOIN bayanat.users su ON su.user_id = d.screening_by_user_id
    LEFT JOIN bayanat.users sb ON sb.user_id = d.submitted_by_user_id
    WHERE d.dpia_id = ${dpiaId}
  `;
  const [template] = await sql<DpiaTemplate[]>`SELECT ${templateCols()} FROM bayanat.dpia_templates t WHERE t.template_id = ${extra.templateId}`;
  const assetRows = await sql<{ typeCode: string; id: number; isSubject: boolean }[]>`
    SELECT asset_type_code AS "typeCode", asset_id AS id, is_subject_indicator AS "isSubject" FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId} ORDER BY added_at
  `;
  const questions = await sql<DpiaQuestion[]>`
    SELECT ${questionCols()}, a.answer_code AS "answerCode", a.answer_text AS "answerText"
    FROM bayanat.dpia_template_questions q
    LEFT JOIN bayanat.dpia_answers a ON a.question_id = q.question_id AND a.dpia_id = ${dpiaId}
    WHERE q.template_id = ${extra.templateId}
    ORDER BY q.sort_order_int, q.question_id
  `;
  const risks = await sql<DpiaRisk[]>`
    SELECT risk_id AS "riskId", risk_title_text AS title, description_text AS description, source_flag_code AS "sourceFlag",
           inherent_likelihood AS "inherentLikelihood", inherent_severity AS "inherentSeverity",
           residual_likelihood AS "residualLikelihood", residual_severity AS "residualSeverity"
    FROM bayanat.dpia_risks WHERE dpia_id = ${dpiaId} ORDER BY sort_order_int, risk_id
  `;
  const measures = await sql<DpiaMeasure[]>`
    SELECT m.measure_id AS "measureId", m.risk_id AS "riskId", m.measure_text AS text, m.owner_user_id AS "ownerUserId", u.full_name AS "ownerName",
           m.due_date::text AS "dueDate", m.status_code AS status, m.completed_date::text AS "completedDate", m.note_text AS note,
           (m.status_code IN ('PLANNED', 'IN_PROGRESS') AND m.due_date < CURRENT_DATE) AS overdue
    FROM bayanat.dpia_measures m LEFT JOIN bayanat.users u ON u.user_id = m.owner_user_id
    WHERE m.dpia_id = ${dpiaId} ORDER BY m.measure_id
  `;
  const events = await sql<DpiaEvent[]>`
    SELECT e.event_id AS "eventId", e.event_code AS code, e.note_text AS note, coalesce(u.full_name, e.user_id) AS user, e.created_at::text AS at
    FROM bayanat.dpia_events e LEFT JOIN bayanat.users u ON u.user_id = e.user_id WHERE e.dpia_id = ${dpiaId} ORDER BY e.created_at DESC, e.event_id DESC
  `;
  const versions = await sql<DpiaVersionInfo[]>`
    SELECT v.version_no AS "versionNo", v.decision_code AS "decisionCode", coalesce(u.full_name, v.created_by_user_id) AS by, v.created_at::text AS at
    FROM bayanat.dpia_versions v LEFT JOIN bayanat.users u ON u.user_id = v.created_by_user_id WHERE v.dpia_id = ${dpiaId} ORDER BY v.version_no DESC
  `;
  return {
    ...summary, description: extra.description, template,
    screeningNote: extra.screeningNote, screeningBy: extra.screeningBy, screeningAt: extra.screeningAt,
    submittedBy: extra.submittedBy, submittedAt: extra.submittedAt, dpoOpinion: extra.dpoOpinion, conditions: extra.conditions,
    consultationCode: extra.consultationCode, consultationNote: extra.consultationNote,
    assets: await describeAssets(assetRows.map((a) => ({ ...a, id: Number(a.id) }))),
    questions: [...questions], risks: [...risks], measures: [...measures], facts: extra.facts, factsAt: extra.factsAt,
    events: [...events], versions: [...versions],
  };
}

/** A frozen version, exactly as it stood at the decision. */
export async function getDpiaVersion(dpiaId: number, versionNo: number): Promise<DpiaDetail | null> {
  const [v] = await sql<{ snapshot: DpiaDetail }[]>`SELECT snapshot_json AS snapshot FROM bayanat.dpia_versions WHERE dpia_id = ${dpiaId} AND version_no = ${versionNo}`;
  return v?.snapshot ?? null;
}

// ── Writes ───────────────────────────────────────────────────────────────────
async function logEvent(dpiaId: number, code: string, userId: string, note: string | null = null): Promise<void> {
  await sql`INSERT INTO bayanat.dpia_events (dpia_id, event_code, note_text, user_id) VALUES (${dpiaId}, ${code}, ${note}, ${userId})`;
  await sql`UPDATE bayanat.dpias SET updated_at = now() WHERE dpia_id = ${dpiaId}`;
}

type Head = { statusCode: DpiaStatus; ownerUserId: string | null; createdByUserId: string | null; versionNo: number; templateId: number; referenceCode: string; title: string };
async function head(dpiaId: number): Promise<Head | null> {
  const [r] = await sql<Head[]>`
    SELECT status_code AS "statusCode", owner_user_id AS "ownerUserId", created_by_user_id AS "createdByUserId", version_no AS "versionNo",
           template_id AS "templateId", reference_code AS "referenceCode", title_text AS title
    FROM bayanat.dpias WHERE dpia_id = ${dpiaId}
  `;
  return r ?? null;
}
/** The assessment, if this user may change its content now. */
async function editable(session: SessionUser, dpiaId: number, stages: DpiaStatus[] = ["SCREENING", "ASSESSMENT"]): Promise<Head | DpiaError> {
  const h = await head(dpiaId);
  if (!h) return fail("NOT_FOUND", "Not found");
  if (!dpiaPermissions(session, h).canEdit) return fail("NOT_EDITABLE", "This assessment cannot be changed in its current status, or you are not its owner.");
  if (!stages.includes(h.statusCode)) return fail("WRONG_STAGE", "This part cannot be changed at the current stage.");
  return h;
}

export async function refreshDpiaFacts(dpiaId: number): Promise<void> {
  const assets = await sql<(AssetRef & { isSubject: boolean })[]>`
    SELECT asset_type_code AS "typeCode", asset_id AS id, is_subject_indicator AS "isSubject" FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId} ORDER BY added_at
  `;
  const refs = assets.map((a) => ({ typeCode: a.typeCode, id: Number(a.id) }));
  const subject = assets.find((a) => a.isSubject);
  const facts = await buildDpiaFacts(refs, subject ? { typeCode: subject.typeCode, id: Number(subject.id) } : null);
  await sql`UPDATE bayanat.dpias SET facts_json = ${sql.json(facts as never)}, facts_at = now() WHERE dpia_id = ${dpiaId}`;
}

export async function createDpia(
  input: { title: unknown; description?: unknown; templateId: unknown; ownerUserId?: unknown; subjectType?: unknown; subjectId?: unknown },
  session: SessionUser,
): Promise<{ dpiaId: number } | DpiaError> {
  const title = text(input.title, 255);
  if (!title) return fail("TITLE_REQUIRED", "A title is required.");
  const [tpl] = await sql<{ templateId: number }[]>`SELECT template_id AS "templateId" FROM bayanat.dpia_templates WHERE template_id = ${Number(input.templateId) || 0} AND is_active_indicator`;
  if (!tpl) return fail("TEMPLATE_REQUIRED", "Choose a questionnaire.");
  const owner = text(input.ownerUserId, 100) ?? session.userId;
  const [u] = await sql`SELECT 1 FROM bayanat.users WHERE user_id = ${owner}`;
  if (!u) return fail("OWNER_UNKNOWN", "Unknown owner.");
  const subjectType = text(input.subjectType, 50), subjectId = Number(input.subjectId);
  if (subjectType && (!validAssetType(subjectType) || !Number.isFinite(subjectId))) return fail("ASSET_INVALID", "Unknown asset.");

  const [{ n }] = await sql<{ n: number }[]>`SELECT nextval('bayanat.dpia_reference_seq')::int AS n`;
  const reference = `DPIA-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  const [row] = await sql<{ dpiaId: number }[]>`
    INSERT INTO bayanat.dpias (reference_code, title_text, description_text, template_id, owner_user_id, created_by_user_id)
    VALUES (${reference}, ${title}, ${text(input.description)}, ${tpl.templateId}, ${owner}, ${session.userId})
    RETURNING dpia_id AS "dpiaId"
  `;
  if (subjectType) {
    await sql`INSERT INTO bayanat.dpia_assets (dpia_id, asset_type_code, asset_id, is_subject_indicator, added_by_user_id)
              VALUES (${row.dpiaId}, ${subjectType}, ${subjectId}, true, ${session.userId})`;
  }
  await refreshDpiaFacts(row.dpiaId);
  await logEvent(row.dpiaId, "CREATED", session.userId);
  return { dpiaId: row.dpiaId };
}

export async function updateDpia(dpiaId: number, input: { title?: unknown; description?: unknown; ownerUserId?: unknown }, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId);
  if ("error" in h) return h;
  const title = input.title === undefined ? h.title : text(input.title, 255);
  if (!title) return fail("TITLE_REQUIRED", "A title is required.");
  const owner = input.ownerUserId === undefined ? h.ownerUserId : text(input.ownerUserId, 100);
  if (owner) { const [u] = await sql`SELECT 1 FROM bayanat.users WHERE user_id = ${owner}`; if (!u) return fail("OWNER_UNKNOWN", "Unknown owner."); }
  await sql`
    UPDATE bayanat.dpias SET title_text = ${title}, owner_user_id = ${owner},
      description_text = ${input.description === undefined ? sql`description_text` : text(input.description)}, updated_at = now()
    WHERE dpia_id = ${dpiaId}
  `;
  return { ok: true };
}

export async function deleteDpia(dpiaId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await head(dpiaId);
  if (!h) return fail("NOT_FOUND", "Not found");
  if (!dpiaPermissions(session, h).canDelete) return fail("NOT_DELETABLE", "An assessment with a recorded decision stays in the register.");
  await sql`DELETE FROM bayanat.dpias WHERE dpia_id = ${dpiaId}`;
  return { ok: true };
}

export async function changeDpiaAsset(dpiaId: number, action: "ADD" | "REMOVE" | "SUBJECT", typeCode: string, assetId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId);
  if ("error" in h) return h;
  if (!validAssetType(typeCode) || !Number.isFinite(assetId)) return fail("ASSET_INVALID", "Unknown asset.");
  if (action === "ADD") {
    const [first] = await sql`SELECT 1 FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId} LIMIT 1`;
    await sql`INSERT INTO bayanat.dpia_assets (dpia_id, asset_type_code, asset_id, is_subject_indicator, added_by_user_id)
              VALUES (${dpiaId}, ${typeCode}, ${assetId}, ${!first}, ${session.userId}) ON CONFLICT DO NOTHING`;
  } else if (action === "REMOVE") {
    await sql`DELETE FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId} AND asset_type_code = ${typeCode} AND asset_id = ${assetId}`;
    // Keep one subject while anything is linked.
    await sql`
      UPDATE bayanat.dpia_assets SET is_subject_indicator = true
      WHERE dpia_id = ${dpiaId} AND NOT EXISTS (SELECT 1 FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId} AND is_subject_indicator)
        AND (asset_type_code, asset_id) = (SELECT asset_type_code, asset_id FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId} ORDER BY added_at LIMIT 1)
    `;
  } else {
    await sql`UPDATE bayanat.dpia_assets SET is_subject_indicator = (asset_type_code = ${typeCode} AND asset_id = ${assetId}) WHERE dpia_id = ${dpiaId}`;
  }
  await refreshDpiaFacts(dpiaId);
  await sql`UPDATE bayanat.dpias SET updated_at = now() WHERE dpia_id = ${dpiaId}`;
  return { ok: true };
}

export async function refreshDpia(dpiaId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId);
  if ("error" in h) return h;
  await refreshDpiaFacts(dpiaId);
  return { ok: true };
}

/** Screening answers while screening, assessment answers while assessing. */
export async function saveDpiaAnswers(dpiaId: number, answers: { questionId: unknown; answerCode?: unknown; answerText?: unknown }[], session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId);
  if ("error" in h) return h;
  const stage = h.statusCode === "SCREENING" ? "SCREENING" : "ASSESSMENT";
  const allowed = await sql<{ questionId: number }[]>`
    SELECT question_id AS "questionId" FROM bayanat.dpia_template_questions WHERE template_id = ${h.templateId} AND stage_code = ${stage}
  `;
  const ok = new Set(allowed.map((q) => Number(q.questionId)));
  for (const a of Array.isArray(answers) ? answers : []) {
    const qid = Number(a.questionId);
    if (!ok.has(qid)) continue;
    const code = a.answerCode === "YES" || a.answerCode === "NO" ? a.answerCode : null;
    await sql`
      INSERT INTO bayanat.dpia_answers (dpia_id, question_id, answer_code, answer_text, updated_by_user_id)
      VALUES (${dpiaId}, ${qid}, ${code}, ${text(a.answerText)}, ${session.userId})
      ON CONFLICT (dpia_id, question_id) DO UPDATE SET answer_code = EXCLUDED.answer_code, answer_text = EXCLUDED.answer_text,
        updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
    `;
  }
  await sql`UPDATE bayanat.dpias SET updated_at = now() WHERE dpia_id = ${dpiaId}`;
  return { ok: true };
}

async function freezeVersion(dpiaId: number, decisionCode: string, userId: string): Promise<number> {
  const d = await getDpia(dpiaId);
  if (!d) return 0;
  const versionNo = d.versionNo + 1;
  const snapshot = { ...d, versionNo, events: [], versions: [] };
  await sql`INSERT INTO bayanat.dpia_versions (dpia_id, version_no, decision_code, snapshot_json, created_by_user_id)
            VALUES (${dpiaId}, ${versionNo}, ${decisionCode}, ${sql.json(snapshot as never)}, ${userId})`;
  await sql`UPDATE bayanat.dpias SET version_no = ${versionNo} WHERE dpia_id = ${dpiaId}`;
  return versionNo;
}

export async function decideScreening(dpiaId: number, input: { outcome: unknown; note?: unknown }, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["SCREENING"]);
  if ("error" in h) return h;
  const outcome = input.outcome === "REQUIRED" || input.outcome === "NOT_REQUIRED" ? input.outcome : null;
  if (!outcome) return fail("OUTCOME_REQUIRED", "Choose an outcome.");
  const d = await getDpia(dpiaId);
  if (!d) return fail("NOT_FOUND", "Not found");
  const rec = screeningRecommendation(d.questions, d.template.threshold);
  if (rec.answered < rec.total) return fail("SCREENING_INCOMPLETE", "Answer every screening question first.");
  const note = text(input.note);
  if (outcome === "NOT_REQUIRED" && rec.required) {
    if (!dpiaPermissions(session, h).canOverrideScreening) return fail("OVERRIDE_NOT_ALLOWED", "The answers call for an assessment. Only a data protection officer can record that none is needed.");
    if (!note) return fail("JUSTIFICATION_REQUIRED", "Explain why no assessment is needed although the answers call for one.");
  }
  await refreshDpiaFacts(dpiaId);
  await sql`
    UPDATE bayanat.dpias SET screening_outcome_code = ${outcome}, screening_note_text = ${note}, screening_by_user_id = ${session.userId}, screening_at = now(),
      status_code = ${outcome === "REQUIRED" ? "ASSESSMENT" : "NOT_REQUIRED"},
      decided_by_user_id = ${outcome === "NOT_REQUIRED" ? session.userId : null}, decided_at = ${outcome === "NOT_REQUIRED" ? sql`now()` : null}
    WHERE dpia_id = ${dpiaId}
  `;
  if (outcome === "NOT_REQUIRED") await freezeVersion(dpiaId, "NOT_REQUIRED", session.userId);
  await logEvent(dpiaId, outcome === "REQUIRED" ? "SCREENED_REQUIRED" : "SCREENED_NOT_REQUIRED", session.userId, note);
  return { ok: true };
}

// ── Risks ────────────────────────────────────────────────────────────────────
type RiskInput = { title?: unknown; description?: unknown; inherentLikelihood?: unknown; inherentSeverity?: unknown; residualLikelihood?: unknown; residualSeverity?: unknown; sourceFlag?: unknown };

export async function addDpiaRisks(dpiaId: number, items: RiskInput[], session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["ASSESSMENT"]);
  if ("error" in h) return h;
  for (const r of items) {
    const title = text(r.title, 300), l = score(r.inherentLikelihood), s = score(r.inherentSeverity);
    if (!title || !l || !s) return fail("RISK_INVALID", "A risk needs a title, a likelihood and a severity.");
    const flag = text(r.sourceFlag, 40);
    if (flag) { const [dup] = await sql`SELECT 1 FROM bayanat.dpia_risks WHERE dpia_id = ${dpiaId} AND source_flag_code = ${flag}`; if (dup) continue; }
    await sql`
      INSERT INTO bayanat.dpia_risks (dpia_id, risk_title_text, description_text, source_flag_code, inherent_likelihood, inherent_severity, residual_likelihood, residual_severity, created_by_user_id)
      VALUES (${dpiaId}, ${title}, ${text(r.description)}, ${flag}, ${l}, ${s}, ${score(r.residualLikelihood)}, ${score(r.residualSeverity)}, ${session.userId})
    `;
  }
  await sql`UPDATE bayanat.dpias SET updated_at = now() WHERE dpia_id = ${dpiaId}`;
  return { ok: true };
}

export async function updateDpiaRisk(dpiaId: number, riskId: number, r: RiskInput, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["ASSESSMENT"]);
  if ("error" in h) return h;
  const title = text(r.title, 300), l = score(r.inherentLikelihood), s = score(r.inherentSeverity);
  if (!title || !l || !s) return fail("RISK_INVALID", "A risk needs a title, a likelihood and a severity.");
  const rl = score(r.residualLikelihood), rs = score(r.residualSeverity);
  if ((rl == null) !== (rs == null)) return fail("RESIDUAL_INCOMPLETE", "Give both the likelihood and the severity that remain, or neither.");
  await sql`
    UPDATE bayanat.dpia_risks SET risk_title_text = ${title}, description_text = ${text(r.description)}, inherent_likelihood = ${l}, inherent_severity = ${s},
      residual_likelihood = ${rl}, residual_severity = ${rs}
    WHERE risk_id = ${riskId} AND dpia_id = ${dpiaId}
  `;
  await sql`UPDATE bayanat.dpias SET updated_at = now() WHERE dpia_id = ${dpiaId}`;
  return { ok: true };
}

export async function deleteDpiaRisk(dpiaId: number, riskId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["ASSESSMENT"]);
  if ("error" in h) return h;
  await sql`DELETE FROM bayanat.dpia_risks WHERE risk_id = ${riskId} AND dpia_id = ${dpiaId}`;
  return { ok: true };
}

// ── Measures ─────────────────────────────────────────────────────────────────
type MeasureInput = { text?: unknown; riskId?: unknown; ownerUserId?: unknown; dueDate?: unknown; status?: unknown; note?: unknown };
const measureStatus = (v: unknown): MeasureStatus | null => ((MEASURE_STATUSES as readonly string[]).includes(String(v)) ? (v as MeasureStatus) : null);

async function notifyMeasureOwner(dpiaId: number, ownerUserId: string | null, actorId: string, h: Head, measureText: string): Promise<void> {
  if (!ownerUserId || ownerUserId === actorId) return;
  await createNotification({
    userId: ownerUserId, type: "REVIEW", title: `Measure assigned to you — ${h.referenceCode}`,
    body: `${h.title}: ${measureText.slice(0, 200)}`, actionLabel: "Open the assessment", actionHref: `/privacy/dpia/${dpiaId}?tab=risks`,
  }).catch(() => {});
}

export async function addDpiaMeasure(dpiaId: number, m: MeasureInput, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["ASSESSMENT"]);
  if ("error" in h) return h;
  const body = text(m.text);
  if (!body) return fail("MEASURE_INVALID", "Describe the measure.");
  const riskId = Number(m.riskId) || null;
  if (riskId) { const [r] = await sql`SELECT 1 FROM bayanat.dpia_risks WHERE risk_id = ${riskId} AND dpia_id = ${dpiaId}`; if (!r) return fail("RISK_UNKNOWN", "Unknown risk."); }
  const owner = text(m.ownerUserId, 100);
  if (owner) { const [u] = await sql`SELECT 1 FROM bayanat.users WHERE user_id = ${owner}`; if (!u) return fail("OWNER_UNKNOWN", "Unknown owner."); }
  await sql`
    INSERT INTO bayanat.dpia_measures (dpia_id, risk_id, measure_text, owner_user_id, due_date, created_by_user_id)
    VALUES (${dpiaId}, ${riskId}, ${body}, ${owner}, ${isoDate(m.dueDate)}, ${session.userId})
  `;
  await sql`UPDATE bayanat.dpias SET updated_at = now() WHERE dpia_id = ${dpiaId}`;
  await notifyMeasureOwner(dpiaId, owner, session.userId, h, body);
  return { ok: true };
}

/**
 * The measure's wording, owner and due date change only while the assessment is being
 * written. Its progress (status, note) can be recorded at any time, also after approval,
 * by the assessment's authors, a reviewer or the measure's own owner.
 */
export async function updateDpiaMeasure(dpiaId: number, measureId: number, m: MeasureInput, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await head(dpiaId);
  if (!h) return fail("NOT_FOUND", "Not found");
  const [cur] = await sql<{ ownerUserId: string | null; status: MeasureStatus; text: string }[]>`
    SELECT owner_user_id AS "ownerUserId", status_code AS status, measure_text AS text FROM bayanat.dpia_measures WHERE measure_id = ${measureId} AND dpia_id = ${dpiaId}
  `;
  if (!cur) return fail("NOT_FOUND", "Not found");
  const p = dpiaPermissions(session, h);
  const author = isReviewer(session.role) || h.ownerUserId === session.userId || h.createdByUserId === session.userId;
  const definition = m.text !== undefined || m.riskId !== undefined || m.ownerUserId !== undefined || m.dueDate !== undefined;
  if (definition) {
    if (!p.canEdit || h.statusCode !== "ASSESSMENT") return fail("NOT_EDITABLE", "The measure can only be reworded while the assessment is being written.");
    const body = text(m.text);
    if (!body) return fail("MEASURE_INVALID", "Describe the measure.");
    const riskId = Number(m.riskId) || null;
    if (riskId) { const [r] = await sql`SELECT 1 FROM bayanat.dpia_risks WHERE risk_id = ${riskId} AND dpia_id = ${dpiaId}`; if (!r) return fail("RISK_UNKNOWN", "Unknown risk."); }
    const owner = text(m.ownerUserId, 100);
    if (owner) { const [u] = await sql`SELECT 1 FROM bayanat.users WHERE user_id = ${owner}`; if (!u) return fail("OWNER_UNKNOWN", "Unknown owner."); }
    await sql`UPDATE bayanat.dpia_measures SET measure_text = ${body}, risk_id = ${riskId}, owner_user_id = ${owner}, due_date = ${isoDate(m.dueDate)}, updated_at = now() WHERE measure_id = ${measureId}`;
    if (owner !== cur.ownerUserId) await notifyMeasureOwner(dpiaId, owner, session.userId, h, body);
  }
  if (m.status !== undefined || m.note !== undefined) {
    if (!author && cur.ownerUserId !== session.userId) return fail("FORBIDDEN", "Only the assessment's authors, a reviewer or the measure's owner can record progress.");
    const status = m.status === undefined ? cur.status : measureStatus(m.status);
    if (!status) return fail("STATUS_INVALID", "Unknown status.");
    await sql`
      UPDATE bayanat.dpia_measures SET status_code = ${status},
        completed_date = ${status === "DONE" ? sql`coalesce(completed_date, CURRENT_DATE)` : null},
        note_text = ${m.note === undefined ? sql`note_text` : text(m.note)}, updated_at = now()
      WHERE measure_id = ${measureId}
    `;
    if (status !== cur.status) await logEvent(dpiaId, `MEASURE_${status}`, session.userId, cur.text.slice(0, 300));
  }
  return { ok: true };
}

export async function deleteDpiaMeasure(dpiaId: number, measureId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["ASSESSMENT"]);
  if ("error" in h) return h;
  await sql`DELETE FROM bayanat.dpia_measures WHERE measure_id = ${measureId} AND dpia_id = ${dpiaId}`;
  return { ok: true };
}

// ── Review and decision ──────────────────────────────────────────────────────
export async function submitDpia(dpiaId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await editable(session, dpiaId, ["ASSESSMENT"]);
  if ("error" in h) return h;
  const d = await getDpia(dpiaId);
  if (!d) return fail("NOT_FOUND", "Not found");
  if (d.assets.length === 0) return fail("SCOPE_REQUIRED", "Link at least one asset the assessment is about.");
  if (d.questions.some((q) => q.stage === "ASSESSMENT" && q.required && !q.answerText)) return fail("ANSWERS_REQUIRED", "Answer the required questions first.");
  if (d.risks.length === 0) return fail("RISKS_REQUIRED", "Record at least one risk, even if it is low.");
  await refreshDpiaFacts(dpiaId);
  await sql`UPDATE bayanat.dpias SET status_code = 'IN_REVIEW', submitted_by_user_id = ${session.userId}, submitted_at = now() WHERE dpia_id = ${dpiaId}`;
  await logEvent(dpiaId, "SUBMITTED", session.userId);
  const officers = await sql<{ userId: string }[]>`SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'OFFICER' AND is_active AND user_id <> ${session.userId}`;
  for (const o of officers) {
    await createNotification({
      userId: o.userId, type: "REVIEW", title: `Impact assessment awaiting review — ${h.referenceCode}`, body: h.title,
      actionLabel: "Review", actionHref: `/privacy/dpia/${dpiaId}?tab=review`,
    }).catch(() => {});
  }
  return { ok: true };
}

async function notifyAuthors(dpiaId: number, h: Head, actorId: string, title: string, body: string | null, severity: "INFO" | "SUCCESS" | "WARNING"): Promise<void> {
  for (const userId of new Set([h.ownerUserId, h.createdByUserId])) {
    if (!userId || userId === actorId) continue;
    await createNotification({ userId, type: "REVIEW", title, body, severity, actionLabel: "Open the assessment", actionHref: `/privacy/dpia/${dpiaId}` }).catch(() => {});
  }
}

export async function returnDpia(dpiaId: number, note: unknown, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await head(dpiaId);
  if (!h) return fail("NOT_FOUND", "Not found");
  if (!dpiaPermissions(session, h).canReview) return fail("FORBIDDEN", "Only a data protection officer can review an assessment that is in review.");
  const reason = text(note);
  if (!reason) return fail("REASON_REQUIRED", "Say what needs to change.");
  await sql`UPDATE bayanat.dpias SET status_code = 'ASSESSMENT' WHERE dpia_id = ${dpiaId}`;
  await logEvent(dpiaId, "RETURNED", session.userId, reason);
  await notifyAuthors(dpiaId, h, session.userId, `Impact assessment returned for changes — ${h.referenceCode}`, reason, "WARNING");
  return { ok: true };
}

export async function decideDpia(
  dpiaId: number,
  input: { decision: unknown; opinion?: unknown; conditions?: unknown; consultationCode?: unknown; consultationNote?: unknown; nextReviewDate?: unknown },
  session: SessionUser,
): Promise<{ ok: true; versionNo: number } | DpiaError> {
  const h = await head(dpiaId);
  if (!h) return fail("NOT_FOUND", "Not found");
  if (!dpiaPermissions(session, h).canReview) return fail("FORBIDDEN", "Only a data protection officer can decide an assessment that is in review.");
  const decision = input.decision === "APPROVED" || input.decision === "APPROVED_WITH_CONDITIONS" || input.decision === "REJECTED" ? input.decision : null;
  if (!decision) return fail("DECISION_REQUIRED", "Choose a decision.");
  const opinion = text(input.opinion), conditions = text(input.conditions);
  if (!opinion) return fail("OPINION_REQUIRED", "Record the data protection officer's opinion.");
  if (decision === "APPROVED_WITH_CONDITIONS" && !conditions) return fail("CONDITIONS_REQUIRED", "State the conditions.");
  const consultation = (CONSULTATION_CODES as readonly string[]).includes(String(input.consultationCode)) ? (input.consultationCode as ConsultationCode) : "NOT_RECORDED";
  const d = await getDpia(dpiaId);
  if (!d) return fail("NOT_FOUND", "Not found");
  if (decision === "APPROVED" && overallResidual(d.risks) === "HIGH" && consultation !== "SUBMITTED" && consultation !== "CLEARED") {
    return fail("HIGH_RESIDUAL", "The remaining risk is high. Record the consultation with the regulator, approve with conditions, or return the assessment for more mitigation.");
  }
  const approved = decision !== "REJECTED";
  await sql`
    UPDATE bayanat.dpias SET status_code = ${decision}, dpo_opinion_text = ${opinion}, conditions_text = ${decision === "APPROVED_WITH_CONDITIONS" ? conditions : null},
      consultation_code = ${consultation}, consultation_note_text = ${text(input.consultationNote)},
      decided_by_user_id = ${session.userId}, decided_at = now(),
      next_review_date = ${approved ? sql`coalesce(${isoDate(input.nextReviewDate)}::date, (CURRENT_DATE + interval '1 year')::date)` : null}
    WHERE dpia_id = ${dpiaId}
  `;
  const versionNo = await freezeVersion(dpiaId, decision, session.userId);
  await logEvent(dpiaId, decision, session.userId, opinion);
  await notifyAuthors(dpiaId, h, session.userId,
    `Impact assessment ${decision === "REJECTED" ? "rejected" : decision === "APPROVED" ? "approved" : "approved with conditions"} — ${h.referenceCode}`,
    decision === "APPROVED_WITH_CONDITIONS" ? conditions : opinion, approved ? "SUCCESS" : "WARNING");
  return { ok: true, versionNo };
}

/** Starts a new round on a decided assessment. Earlier versions stay as they were. */
export async function reopenDpia(dpiaId: number, note: unknown, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const h = await head(dpiaId);
  if (!h) return fail("NOT_FOUND", "Not found");
  if (!dpiaPermissions(session, h).canReopen) return fail("FORBIDDEN", "This assessment cannot be reopened by you.");
  const reason = text(note);
  if (!reason) return fail("REASON_REQUIRED", "Say why the assessment is being reopened.");
  await sql`
    UPDATE bayanat.dpias SET status_code = ${h.statusCode === "NOT_REQUIRED" ? "SCREENING" : "ASSESSMENT"},
      decided_by_user_id = NULL, decided_at = NULL, dpo_opinion_text = NULL, conditions_text = NULL, next_review_date = NULL,
      consultation_code = 'NOT_RECORDED', consultation_note_text = NULL
    WHERE dpia_id = ${dpiaId}
  `;
  await refreshDpiaFacts(dpiaId);
  await logEvent(dpiaId, "REOPENED", session.userId, reason);
  return { ok: true };
}

/** People an assessment or a measure can be given to. */
export async function dpiaUserOptions(): Promise<{ userId: string; name: string; role: string }[]> {
  return sql<{ userId: string; name: string; role: string }[]>`
    SELECT user_id AS "userId", full_name AS name, role FROM bayanat.users WHERE is_active ORDER BY full_name
  `;
}
