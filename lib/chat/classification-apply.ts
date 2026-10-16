// Applying Ask Bayanis's classification advice, when an administrator allows it
// (Configuration › Ask Bayanis, system_config "ask_bayanis_apply_classification", off by
// default). The assistant proposes; the server checks every change against the column's
// candidate terms and stores the proposal with the message; the user ticks what to keep
// and clicks Apply. Apply uses the stored proposal, never terms sent by the browser, and
// re-checks the setting and the user's right to edit metadata. Each change goes through
// applyClassificationTerm (term link, level, audit), and the batch is recorded as a
// Classify Asset request with its workflow, like other classification changes.
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";
import { canEditMetadata } from "@/lib/can";
import { startWorkflow } from "@/lib/workflow";
import { schedulePropagation } from "@/lib/lineage/propagation";
import { applyClassificationTerm } from "@/lib/queries/sit-classification";
import { classificationAdvice } from "./classification-advice";
import type { SessionUser } from "@/lib/types";

export const APPLY_SETTING = "ask_bayanis_apply_classification";

export async function isApplyEnabled(): Promise<boolean> {
  const [row] = await sql<{ value: string }[]>`SELECT value FROM bayanat.system_config WHERE key = ${APPLY_SETTING}`;
  return row?.value === "true";
}

export async function setApplyEnabled(enabled: boolean, userId: string): Promise<void> {
  const before = await isApplyEnabled();
  await sql`
    INSERT INTO bayanat.system_config (key, value) VALUES (${APPLY_SETTING}, ${String(enabled)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  if (before !== enabled) {
    await logUpdate("PLATFORM_SETTINGS", 1, userId, [{ field: APPLY_SETTING, oldVal: String(before), newVal: String(enabled) }]);
  }
}

/** May this user be offered the Apply button now? */
export async function canApplyClassification(session: SessionUser): Promise<boolean> {
  return (await isApplyEnabled()) && (await canEditMetadata(session));
}

export type ClassificationChange = {
  columnId: number; column: string; glossaryId: number; term: string; level: string | null;
  personalData: boolean; category: string | null; currentTerm: string | null;
};
export type ClassificationProposal = {
  kind: "CLASSIFY_COLUMNS";
  tableId: number; table: string; href: string;
  changes: ClassificationChange[];
  applied?: { at: string; by: string; columnIds: number[]; requestId: number | null };
};

/**
 * Checks the assistant's recommendations and keeps only valid changes: the column is in
 * the table, the term is one of its candidates or Bayanis's suggestion, and it differs
 * from the column's current term. Returns the proposal and why anything was left out.
 */
export async function buildProposal(tableId: number, wanted: { columnId: number; term: string }[]):
  Promise<{ proposal: ClassificationProposal | null; skipped: { columnId: number; term: string; reason: string }[] }> {
  const advice = await classificationAdvice(tableId, false);
  if (!advice) return { proposal: null, skipped: wanted.map((w) => ({ ...w, reason: "table not found" })) };

  const termIds = await sql<{ id: number; name: string }[]>`
    SELECT glossary_id AS id, term_name_text AS name FROM bayanat.business_glossaries
    WHERE term_type = 'TERM' AND classification_code IS NOT NULL`;
  const idOf = (name: string) => termIds.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;

  const changes: ClassificationChange[] = [];
  const skipped: { columnId: number; term: string; reason: string }[] = [];
  for (const w of wanted) {
    const col = advice.columns.find((c) => c.columnId === Number(w.columnId));
    if (!col) { skipped.push({ ...w, reason: "not a column of this table" }); continue; }
    const options = [...(Array.isArray(col.candidateTerms) ? col.candidateTerms : []), ...(col.sensitiveTypeSuggestion ? [col.sensitiveTypeSuggestion] : [])];
    const pick = options.find((o) => o.term.toLowerCase() === String(w.term ?? "").trim().toLowerCase());
    const glossaryId = pick ? idOf(pick.term) : null;
    if (!pick || !glossaryId) { skipped.push({ ...w, reason: "not one of the column's candidate terms" }); continue; }
    if (col.currentClassification?.term.toLowerCase() === pick.term.toLowerCase()) { skipped.push({ ...w, reason: "already classified with this term" }); continue; }
    if (changes.some((c) => c.columnId === col.columnId)) { skipped.push({ ...w, reason: "column listed twice" }); continue; }
    changes.push({
      columnId: col.columnId, column: col.name, glossaryId, term: pick.term, level: pick.level,
      personalData: pick.personalData,
      category: "category" in pick ? pick.category : pick.personalDataCategory,
      currentTerm: col.currentClassification?.term ?? null,
    });
  }
  return {
    proposal: changes.length ? { kind: "CLASSIFY_COLUMNS", tableId, table: advice.table.name, href: advice.href, changes } : null,
    skipped,
  };
}

export type ApplyResult = { ok: true; applied: number; requestId: number | null; proposal: ClassificationProposal } | { ok: false; status: number; error: string };

/** Applies the chosen changes of a proposal stored on one of the user's messages. */
export async function applyProposal(messageId: number, columnIds: number[], session: SessionUser): Promise<ApplyResult> {
  if (!(await isApplyEnabled())) return { ok: false, status: 403, error: "Applying classification advice is switched off by an administrator." };
  if (!(await canEditMetadata(session))) return { ok: false, status: 403, error: "You are not allowed to change classifications." };

  const [msg] = await sql<{ actions: unknown; userId: string }[]>`
    SELECT m.actions_json AS actions, c.user_id AS "userId"
    FROM bayanat.chat_messages m JOIN bayanat.chat_conversations c ON c.conversation_id = m.conversation_id
    WHERE m.message_id = ${messageId}`;
  if (!msg || msg.userId !== session.userId) return { ok: false, status: 404, error: "Proposal not found." };
  const raw = typeof msg.actions === "string" ? JSON.parse(msg.actions) : msg.actions;
  const actions = (Array.isArray(raw) ? raw : []) as ClassificationProposal[];
  const idx = actions.findIndex((a) => a.kind === "CLASSIFY_COLUMNS");
  if (idx < 0) return { ok: false, status: 404, error: "Proposal not found." };
  const proposal = actions[idx];
  if (proposal.applied) return { ok: false, status: 409, error: "This proposal was already applied." };

  const chosen = proposal.changes.filter((c) => columnIds.includes(c.columnId));
  if (chosen.length === 0) return { ok: false, status: 400, error: "Choose at least one change." };

  for (const c of chosen) {
    await applyClassificationTerm(c.columnId, c.glossaryId, session.userId);
    // A pending suggestion for the same term is now accepted, so it leaves the review queue.
    await sql`
      UPDATE bayanat.data_attributes SET sit_suggestion_status_code = 'ACCEPTED', sit_classified_by_user_id = ${session.userId}, sit_classified_at_timestamp = NOW()
      WHERE attribute_id = ${c.columnId} AND suggested_sit_glossary_id = ${c.glossaryId} AND sit_suggestion_status_code = 'PENDING'`;
    await logUpdate("DATA_ATTRIBUTES", c.columnId, session.userId, [
      { field: "classification_source", oldVal: null, newVal: `Ask Bayanis advice, applied by the user (term ${c.term})`, force: true },
    ]);
  }

  // One Classify Asset request for the batch, as for other classification changes.
  const title = chosen.length === 1
    ? `Classify column "${chosen[0].column}" of ${proposal.table} as ${chosen[0].term}`
    : `Classify ${chosen.length} columns of ${proposal.table} (Ask Bayanis advice)`;
  const [req] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests (request_type_code, title, description_text, priority_code, raised_by_user_id)
    VALUES ('CLASSIFY_ASSET', ${title}, ${chosen.map((c) => `${c.column}: ${c.term}`).join("\n")}, 'MEDIUM', ${session.userId})
    RETURNING request_id AS "requestId"`;
  for (const c of chosen) {
    await sql`INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
              VALUES (${req.requestId}, 'DATA_ATTRIBUTES', ${c.columnId}, ${c.column})`;
  }
  await startWorkflow(req.requestId, "CLASSIFY_ASSET", title);
  schedulePropagation("classification");

  const done: ClassificationProposal = { ...proposal, applied: { at: new Date().toISOString(), by: session.userId, columnIds: chosen.map((c) => c.columnId), requestId: req.requestId } };
  actions[idx] = done;
  await sql`UPDATE bayanat.chat_messages SET actions_json = ${actions as never}::jsonb WHERE message_id = ${messageId}`;
  return { ok: true, applied: chosen.length, requestId: req.requestId, proposal: done };
}
