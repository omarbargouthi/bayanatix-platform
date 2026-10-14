// Keeping the register current (db/188). Runs daily as the DPIA_WATCH scheduled area, or on
// demand from the register:
//  * suggests a screening for assets the catalog says need one and no assessment covers;
//  * compares each screened, submitted or decided assessment with what the catalog says now
//    and records what changed, so the owner and the officers know a review may be needed;
//  * reminds once when a review date arrives and when a measure becomes overdue.
import { sql } from "../db";
import { createNotification } from "../queries/notifications";
import { markScheduledJobRan } from "../queries/scheduling";
import type { SessionUser } from "../types";
import { buildDpiaFacts, describeAssets, resolveScope, LARGE_SCALE_ROWS, type AssetRef } from "./dpia-facts";
import { dpiaPermissions, isDpiaReviewer, logEvent, type DpiaError } from "./dpia";
import {
  DPIA_WATCHED, type DpiaChange, type DpiaFacts, type DpiaStatus, type DpiaSuggestion, type DpiaSuggestionReason,
} from "./dpia-types";

const fail = (code: string, error: string): DpiaError => ({ code, error });
const text = (v: unknown, max = 5000): string | null => { const s = typeof v === "string" ? v.trim() : ""; return s ? s.slice(0, max) : null; };
const MAX_ITEMS = 10;
const ACTIVITY_TYPE = "CUSTOM:ACTIVITY";

async function officers(): Promise<string[]> {
  const rows = await sql<{ userId: string }[]>`SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'OFFICER' AND is_active`;
  return rows.map((r) => r.userId);
}
async function notifyAll(userIds: (string | null)[], n: { title: string; body: string | null; href: string; severity?: "INFO" | "WARNING" }): Promise<void> {
  for (const userId of new Set(userIds.filter((u): u is string => !!u))) {
    await createNotification({ userId, type: "REVIEW", title: n.title, body: n.body, severity: n.severity ?? "WARNING", actionLabel: "Open", actionHref: n.href }).catch(() => {});
  }
}

// ── Suggestions ──────────────────────────────────────────────────────────────
type Candidate = { typeCode: string; id: number; reasons: DpiaSuggestionReason[] };

/** Tables and activities that no assessment covers, other than rejected ones. */
async function coverage(): Promise<{ entities: Set<number>; assets: Set<string> }> {
  const rows = await sql<{ dpiaId: number; typeCode: string; id: number }[]>`
    SELECT a.dpia_id AS "dpiaId", a.asset_type_code AS "typeCode", a.asset_id AS id
    FROM bayanat.dpia_assets a JOIN bayanat.dpias d ON d.dpia_id = a.dpia_id WHERE d.status_code <> 'REJECTED'
  `;
  const assets = new Set(rows.map((r) => `${r.typeCode}:${Number(r.id)}`));
  const byDpia = new Map<number, AssetRef[]>();
  for (const r of rows) byDpia.set(Number(r.dpiaId), [...(byDpia.get(Number(r.dpiaId)) ?? []), { typeCode: r.typeCode, id: Number(r.id) }]);
  const entities = new Set<number>();
  for (const refs of byDpia.values()) {
    const s = await resolveScope(refs);
    s.entityIds.forEach((e) => entities.add(e));
    if (s.attributeIds.length) {
      const t = await sql<{ e: number }[]>`SELECT DISTINCT entity_id AS e FROM bayanat.data_attributes WHERE attribute_id = ANY(${s.attributeIds})`;
      t.forEach((r) => entities.add(Number(r.e)));
    }
  }
  return { entities, assets };
}

/** A column holds personal data: classified as such, or tagged with a personal-data term. */
const PI_TERM = sql`
  LEFT JOIN LATERAL (
    SELECT true AS hit, bg.pi_category_code AS cat, pc.category_name_text AS name
    FROM bayanat.asset_business_terms abt JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id AND bg.is_pii_indicator
    LEFT JOIN bayanat.pi_category_types pc ON pc.category_code = bg.pi_category_code
    WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    ORDER BY abt.abt_id LIMIT 1
  ) pt ON true
`;

async function tableCandidates(): Promise<Candidate[]> {
  const rows = await sql<{ id: number; rows: number | null; sensitive: number; sensitiveNames: string[]; external: string[] | null; crossBorder: boolean }[]>`
    WITH pi AS (
      SELECT a.entity_id,
             count(*) FILTER (WHERE a.classification_code = 'SENSITIVE' OR pt.cat IN ('HEALTH', 'BIOMETRIC'))::int AS sensitive,
             array_remove(array_agg(DISTINCT CASE WHEN a.classification_code = 'SENSITIVE' OR pt.cat IN ('HEALTH', 'BIOMETRIC') THEN pt.name END), NULL) AS names
      FROM bayanat.data_attributes a ${PI_TERM}
      WHERE a.classification_code IN ('PII', 'SENSITIVE') OR pt.hit
      GROUP BY a.entity_id
    )
    SELECT e.entity_id AS id, e.row_count_estimate::float8 AS rows, pi.sensitive, pi.names AS "sensitiveNames",
           (SELECT array_agg(DISTINCT coalesce(d.counterparty_name_text, d.title_text)) FROM bayanat.dsa_datasets x JOIN bayanat.data_sharing_agreements d ON d.dsa_id = x.dsa_id
            WHERE x.entity_id = e.entity_id AND d.status_code NOT IN ('TERMINATED', 'EXPIRED') AND d.sharing_scope_code <> 'INTERNAL') AS external,
           EXISTS (SELECT 1 FROM bayanat.dsa_datasets x JOIN bayanat.data_sharing_agreements d ON d.dsa_id = x.dsa_id
                   WHERE x.entity_id = e.entity_id AND d.status_code NOT IN ('TERMINATED', 'EXPIRED') AND d.is_cross_border) AS "crossBorder"
    FROM pi JOIN bayanat.data_entities e ON e.entity_id = pi.entity_id
  `;
  const out: Candidate[] = [];
  for (const r of rows) {
    const reasons: DpiaSuggestionReason[] = [];
    if (r.sensitive > 0) reasons.push({ code: "SENSITIVE_PI", n: r.sensitive, detail: r.sensitiveNames?.join(", ") || null });
    if (r.rows != null && r.rows >= LARGE_SCALE_ROWS) reasons.push({ code: "LARGE_SCALE", n: Math.round(r.rows), detail: null });
    if (r.external?.length) reasons.push({ code: "EXTERNAL_SHARING", n: r.external.length, detail: r.external.join(", ") });
    if (r.crossBorder) reasons.push({ code: "CROSS_BORDER", n: 0, detail: null });
    if (reasons.length) out.push({ typeCode: "DATA_ENTITIES", id: Number(r.id), reasons });
  }
  return out;
}

/** Processing activities that handle personal data or send it abroad. */
async function activityCandidates(): Promise<Candidate[]> {
  const rows = await sql<{ id: number; crossBorder: boolean }[]>`
    SELECT ca.custom_asset_id AS id, coalesce(ca.attributes_json->>'CROSS_BORDER', '') = 'true' AS "crossBorder"
    FROM bayanat.custom_assets ca JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
    WHERE t.type_code = 'ACTIVITY'
  `;
  const out: Candidate[] = [];
  for (const r of rows) {
    const s = await resolveScope([{ typeCode: ACTIVITY_TYPE, id: Number(r.id) }]);
    const [{ n }] = s.entityIds.length + s.attributeIds.length === 0 ? [{ n: 0 }] : await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM bayanat.data_attributes a
      WHERE (a.entity_id = ANY(${s.entityIds}) OR a.attribute_id = ANY(${s.attributeIds}))
        AND (a.classification_code IN ('PII', 'SENSITIVE')
          OR EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
                     WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION' AND bg.is_pii_indicator))
    `;
    const reasons: DpiaSuggestionReason[] = [];
    if (n > 0) reasons.push({ code: "PROCESSES_PI", n, detail: null });
    if (r.crossBorder) reasons.push({ code: "CROSS_BORDER", n: 0, detail: null });
    if (reasons.length) out.push({ typeCode: ACTIVITY_TYPE, id: Number(r.id), reasons });
  }
  return out;
}

/**
 * Brings the suggestions in line with the catalog. A dismissed one comes back only when a
 * reason appears that was not there when it was dismissed; one whose asset is now covered,
 * or no longer qualifies, is marked resolved.
 */
export async function refreshDpiaSuggestions(): Promise<{ open: number; added: number; resolved: number }> {
  const covered = await coverage();
  const candidates = [...(await tableCandidates()), ...(await activityCandidates())].filter((c) =>
    c.typeCode === "DATA_ENTITIES" ? !covered.entities.has(c.id) : !covered.assets.has(`${c.typeCode}:${c.id}`));
  const existing = await sql<{ id: number; typeCode: string; assetId: number; status: string; dpiaId: number | null; dismissedReasons: string[] | null }[]>`
    SELECT suggestion_id AS id, asset_type_code AS "typeCode", asset_id AS "assetId", status_code AS status, dpia_id AS "dpiaId", dismissed_reasons AS "dismissedReasons"
    FROM bayanat.dpia_suggestions
  `;
  const byKey = new Map(existing.map((e) => [`${e.typeCode}:${Number(e.assetId)}`, e]));
  let added = 0;
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.typeCode}:${c.id}`;
    seen.add(key);
    const codes = c.reasons.map((r) => r.code);
    const cur = byKey.get(key);
    if (!cur) {
      await sql`INSERT INTO bayanat.dpia_suggestions (asset_type_code, asset_id, reason_codes, reasons_json) VALUES (${c.typeCode}, ${c.id}, ${codes}, ${sql.json(c.reasons as never)})`;
      added++;
      continue;
    }
    const reopen =
      cur.status === "RESOLVED" ||
      (cur.status === "STARTED" && cur.dpiaId == null) ||
      (cur.status === "DISMISSED" && codes.some((x) => !(cur.dismissedReasons ?? []).includes(x)));
    if (reopen) added++;
    await sql`
      UPDATE bayanat.dpia_suggestions SET reason_codes = ${codes}, reasons_json = ${sql.json(c.reasons as never)}, last_seen_at = now(),
        status_code = ${reopen ? "OPEN" : cur.status}, first_seen_at = ${reopen ? sql`now()` : sql`first_seen_at`}
      WHERE suggestion_id = ${cur.id}
    `;
  }
  const gone = existing.filter((e) => e.status === "OPEN" && !seen.has(`${e.typeCode}:${Number(e.assetId)}`)).map((e) => Number(e.id));
  if (gone.length) await sql`UPDATE bayanat.dpia_suggestions SET status_code = 'RESOLVED' WHERE suggestion_id = ANY(${gone})`;
  const [{ open }] = await sql<{ open: number }[]>`SELECT count(*)::int AS open FROM bayanat.dpia_suggestions WHERE status_code = 'OPEN'`;
  if (added > 0) {
    await notifyAll(await officers(), {
      title: `${added} new impact assessment suggestion${added === 1 ? "" : "s"}`,
      body: "The catalog shows personal data that no impact assessment covers yet.",
      href: "/privacy?tab=dpia", severity: "INFO",
    });
  }
  return { open, added, resolved: gone.length };
}

type SuggestionRow = Omit<DpiaSuggestion, "assetName" | "assetTypeName" | "sublabel" | "href" | "reasons"> & { reasons: DpiaSuggestionReason[] };
const suggestionCols = () => sql.unsafe(`
  s.suggestion_id AS "suggestionId", s.asset_type_code AS "assetTypeCode", s.asset_id AS "assetId", s.reasons_json AS reasons,
  s.status_code AS status, s.dpia_id AS "dpiaId", s.first_seen_at::text AS "firstSeenAt",
  coalesce(u.full_name, s.dismissed_by_user_id) AS "dismissedBy", s.dismissed_at::text AS "dismissedAt", s.dismiss_note_text AS "dismissNote"
`);

async function described(rows: SuggestionRow[]): Promise<DpiaSuggestion[]> {
  const assets = await describeAssets(rows.map((r) => ({ typeCode: r.assetTypeCode, id: Number(r.assetId), isSubject: false })));
  return rows.flatMap((r) => {
    const a = assets.find((x) => x.typeCode === r.assetTypeCode && x.id === Number(r.assetId));
    // The asset was deleted since the last check; the next check resolves the suggestion.
    if (!a) return [];
    return [{ ...r, suggestionId: Number(r.suggestionId), assetId: Number(r.assetId), dpiaId: r.dpiaId == null ? null : Number(r.dpiaId), assetName: a.name, assetTypeName: a.typeName, sublabel: a.sublabel, href: a.href }];
  });
}

/** Open suggestions, and dismissed ones so a dismissal can be looked at again. */
export async function listDpiaSuggestions(): Promise<DpiaSuggestion[]> {
  const rows = await sql<SuggestionRow[]>`
    SELECT ${suggestionCols()} FROM bayanat.dpia_suggestions s LEFT JOIN bayanat.users u ON u.user_id = s.dismissed_by_user_id
    WHERE s.status_code IN ('OPEN', 'DISMISSED') ORDER BY s.status_code DESC, s.first_seen_at DESC
  `;
  return described([...rows]);
}

export async function dpiaSuggestionFor(typeCode: string, assetId: number): Promise<DpiaSuggestion | null> {
  const rows = await sql<SuggestionRow[]>`
    SELECT ${suggestionCols()} FROM bayanat.dpia_suggestions s LEFT JOIN bayanat.users u ON u.user_id = s.dismissed_by_user_id
    WHERE s.asset_type_code = ${typeCode} AND s.asset_id = ${assetId} AND s.status_code = 'OPEN'
  `;
  return (await described([...rows]))[0] ?? null;
}

/** Recording that an asset needs no screening is the officer's call, like overriding a screening. */
export async function dismissDpiaSuggestion(suggestionId: number, note: unknown, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  if (!isDpiaReviewer(session.role)) return fail("FORBIDDEN", "Only a data protection officer can dismiss a suggestion.");
  const reason = text(note);
  if (!reason) return fail("REASON_REQUIRED", "A reason is required.");
  const [r] = await sql`
    UPDATE bayanat.dpia_suggestions SET status_code = 'DISMISSED', dismissed_by_user_id = ${session.userId}, dismissed_at = now(),
      dismiss_note_text = ${reason}, dismissed_reasons = reason_codes
    WHERE suggestion_id = ${suggestionId} AND status_code = 'OPEN' RETURNING 1
  `;
  return r ? { ok: true } : fail("SUGGESTION_NOT_FOUND", "This suggestion is no longer open.");
}

export async function restoreDpiaSuggestion(suggestionId: number, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  if (!isDpiaReviewer(session.role)) return fail("FORBIDDEN", "Only a data protection officer can dismiss a suggestion.");
  const [r] = await sql`
    UPDATE bayanat.dpia_suggestions SET status_code = 'OPEN', dismissed_by_user_id = NULL, dismissed_at = NULL, dismiss_note_text = NULL, dismissed_reasons = NULL
    WHERE suggestion_id = ${suggestionId} AND status_code = 'DISMISSED' RETURNING 1
  `;
  return r ? { ok: true } : fail("SUGGESTION_NOT_FOUND", "This suggestion is no longer open.");
}

// ── Changes since the screening, submission or decision ─────────────────────
const cut = (a: string[]) => a.slice(0, MAX_ITEMS);
const short = (v: string) => (v.length > 80 ? v.slice(0, 79) + "…" : v);

/** What the catalog says now that it did not say in the baseline. Only additions count: less personal data is not a reason to review. */
export function diffDpiaFacts(base: DpiaFacts, now: DpiaFacts): DpiaChange[] {
  const changes: DpiaChange[] = [];
  const colKey = (c: { source: string; table: string; column: string }) => `${c.source}|${c.table}|${c.column}`;
  const listedAll = (f: DpiaFacts) => f.personalData.columns.length >= f.personalData.columnCount;
  if (listedAll(base) && listedAll(now)) {
    const had = new Set(base.personalData.columns.map(colKey));
    const added = now.personalData.columns.filter((c) => !had.has(colKey(c)));
    if (added.length) changes.push({ code: "NEW_PI_COLUMNS", n: added.length, items: cut(added.map((c) => `${c.table}.${c.column}`)) });
  } else if (now.personalData.columnCount > base.personalData.columnCount) {
    changes.push({ code: "NEW_PI_COLUMNS", n: now.personalData.columnCount - base.personalData.columnCount, items: [] });
  }

  const hadCats = new Set(base.personalData.categories.filter((c) => c.sensitive).map((c) => c.code));
  const newCats = now.personalData.categories.filter((c) => c.sensitive && !hadCats.has(c.code));
  if (newCats.length) changes.push({ code: "NEW_SENSITIVE", n: newCats.length, items: newCats.map((c) => c.name) });

  const hadFlags = new Set(base.flags.map((f) => f.code));
  for (const f of now.flags) {
    if (hadFlags.has(f.code) || f.code === "NO_PI" || f.code === "NO_SCOPE") continue;
    if (f.code === "SENSITIVE_PI" && newCats.length) continue;
    changes.push({ code: "NEW_FINDING", n: f.n, items: [], flag: f });
  }

  const dsaKey = (s: DpiaFacts["sharing"][number]) => s.reference ?? s.title;
  const hadDsa = new Set(base.sharing.map(dsaKey));
  const newDsa = now.sharing.filter((s) => !hadDsa.has(dsaKey(s)));
  if (newDsa.length) changes.push({ code: "NEW_SHARING", n: newDsa.length, items: cut(newDsa.map((s) => s.counterparty ? `${s.title} (${s.counterparty})` : s.title)) });

  const hadSystems = new Set(base.flows.systems);
  const newSystems = now.flows.systems.filter((s) => !hadSystems.has(s));
  if (newSystems.length) changes.push({ code: "NEW_SYSTEMS", n: newSystems.length, items: cut(newSystems) });

  if (base.subject && now.subject) {
    const before = new Map(base.subject.attributes.map((a) => [a.code, a.value]));
    const after = new Map(now.subject.attributes.map((a) => [a.code, a.value]));
    const items: string[] = [];
    for (const a of now.subject.attributes) if (before.get(a.code) !== a.value) items.push(`${a.label}: ${short(before.get(a.code) ?? "—")} → ${short(a.value)}`);
    for (const a of base.subject.attributes) if (!after.has(a.code)) items.push(`${a.label}: ${short(a.value)} → —`);
    if (items.length) changes.push({ code: "SUBJECT_CHANGED", n: items.length, items: cut(items) });
  }
  return changes;
}

const changeKey = (c: DpiaChange) => `${c.code}:${c.flag?.code ?? ""}:${c.items.join("|")}:${c.code === "NEW_FINDING" ? "" : c.n}`;

/** Compares one assessment with the catalog and records the result. Returns the changes, or null when it is not watched. */
export async function checkDpiaChanges(dpiaId: number): Promise<DpiaChange[] | null> {
  const [d] = await sql<{ status: DpiaStatus; facts: DpiaFacts | null; baseline: DpiaFacts | null; stored: DpiaChange[] | null; owner: string | null; creator: string | null; reference: string; title: string }[]>`
    SELECT status_code AS status, facts_json AS facts, baseline_facts_json AS baseline, changes_json AS stored,
           owner_user_id AS owner, created_by_user_id AS creator, reference_code AS reference, title_text AS title
    FROM bayanat.dpias WHERE dpia_id = ${dpiaId}
  `;
  if (!d || !DPIA_WATCHED.includes(d.status)) return null;
  const base = d.baseline ?? d.facts;
  if (!base) return null;
  const assets = await sql<{ typeCode: string; id: number; isSubject: boolean }[]>`
    SELECT asset_type_code AS "typeCode", asset_id AS id, is_subject_indicator AS "isSubject" FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId}
  `;
  const refs = assets.map((a) => ({ typeCode: a.typeCode, id: Number(a.id) }));
  const subject = assets.find((a) => a.isSubject);
  const now = await buildDpiaFacts(refs, subject ? { typeCode: subject.typeCode, id: Number(subject.id) } : null);
  const changes = diffDpiaFacts(base, now);
  const existing = await describeAssets(assets.map((a) => ({ ...a, id: Number(a.id) })));
  if (existing.length < assets.length) changes.push({ code: "ASSET_REMOVED", n: assets.length - existing.length, items: [] });

  const stored = d.stored ?? [];
  if (changes.length === 0) {
    if (stored.length) await sql`UPDATE bayanat.dpias SET changes_json = NULL, changes_detected_at = NULL WHERE dpia_id = ${dpiaId}`;
    return changes;
  }
  const had = new Set(stored.map(changeKey));
  const grown = changes.some((c) => !had.has(changeKey(c)));
  if (!grown && stored.length === changes.length) return changes;
  await sql`
    UPDATE bayanat.dpias SET changes_json = ${sql.json(changes as never)},
      changes_detected_at = ${grown ? sql`now()` : sql`coalesce(changes_detected_at, now())`}
    WHERE dpia_id = ${dpiaId}
  `;
  if (grown) {
    await sql`INSERT INTO bayanat.dpia_events (dpia_id, event_code, note_text, user_id) VALUES (${dpiaId}, 'CHANGES_DETECTED', NULL, NULL)`;
    await notifyAll([d.owner, d.creator, ...(await officers())], {
      title: `The catalog changed since this assessment — ${d.reference}`,
      body: `${d.title}: review whether the assessment still holds.`,
      href: `/privacy/dpia/${dpiaId}`,
    });
  }
  return changes;
}

/** An officer looked at the changes and found nothing that alters the assessment. They become the new point of comparison. */
export async function acknowledgeDpiaChanges(dpiaId: number, note: unknown, session: SessionUser): Promise<{ ok: true } | DpiaError> {
  const [h] = await sql<{ statusCode: DpiaStatus; ownerUserId: string | null; createdByUserId: string | null; versionNo: number; pending: boolean }[]>`
    SELECT status_code AS "statusCode", owner_user_id AS "ownerUserId", created_by_user_id AS "createdByUserId", version_no AS "versionNo",
           changes_json IS NOT NULL AS pending
    FROM bayanat.dpias WHERE dpia_id = ${dpiaId}
  `;
  if (!h) return fail("NOT_FOUND", "Not found");
  if (!dpiaPermissions(session, h).canAcknowledgeChanges) return fail("FORBIDDEN", "Only a data protection officer can record that the changes are not material.");
  if (!h.pending) return fail("NO_CHANGES", "No change is waiting to be looked at.");
  const reason = text(note);
  if (!reason) return fail("REASON_REQUIRED", "A reason is required.");
  const assets = await sql<{ typeCode: string; id: number; isSubject: boolean }[]>`
    SELECT asset_type_code AS "typeCode", asset_id AS id, is_subject_indicator AS "isSubject" FROM bayanat.dpia_assets WHERE dpia_id = ${dpiaId}
  `;
  const subject = assets.find((a) => a.isSubject);
  const now = await buildDpiaFacts(assets.map((a) => ({ typeCode: a.typeCode, id: Number(a.id) })), subject ? { typeCode: subject.typeCode, id: Number(subject.id) } : null);
  await sql`UPDATE bayanat.dpias SET baseline_facts_json = ${sql.json(now as never)}, changes_json = NULL, changes_detected_at = NULL WHERE dpia_id = ${dpiaId}`;
  await logEvent(dpiaId, "CHANGES_ACKNOWLEDGED", session.userId, reason);
  return { ok: true };
}

async function checkAllChanges(): Promise<{ checked: number; withChanges: number }> {
  const rows = await sql<{ id: number }[]>`SELECT dpia_id AS id FROM bayanat.dpias WHERE status_code = ANY(${DPIA_WATCHED}) ORDER BY dpia_id`;
  let withChanges = 0;
  for (const r of rows) if ((await checkDpiaChanges(Number(r.id)))?.length) withChanges++;
  return { checked: rows.length, withChanges };
}

// ── Reminders ────────────────────────────────────────────────────────────────
async function sendReminders(): Promise<{ reviewsDue: number; measuresOverdue: number }> {
  const due = await sql<{ id: number; reference: string; title: string; owner: string | null; creator: string | null; date: string }[]>`
    SELECT dpia_id AS id, reference_code AS reference, title_text AS title, owner_user_id AS owner, created_by_user_id AS creator, next_review_date::text AS date
    FROM bayanat.dpias
    WHERE status_code IN ('APPROVED', 'APPROVED_WITH_CONDITIONS') AND next_review_date <= CURRENT_DATE
      AND (review_reminded_on IS NULL OR review_reminded_on < next_review_date)
  `;
  const officerIds = due.length ? await officers() : [];
  for (const d of due) {
    await notifyAll([d.owner, d.creator, ...officerIds], { title: `Impact assessment due for review — ${d.reference}`, body: `${d.title} (review date ${d.date})`, href: `/privacy/dpia/${d.id}` });
    await sql`UPDATE bayanat.dpias SET review_reminded_on = CURRENT_DATE WHERE dpia_id = ${d.id}`;
  }
  const late = await sql<{ id: number; dpiaId: number; reference: string; text: string; owner: string | null; dueDate: string }[]>`
    SELECT m.measure_id AS id, m.dpia_id AS "dpiaId", d.reference_code AS reference, m.measure_text AS text,
           coalesce(m.owner_user_id, d.owner_user_id) AS owner, m.due_date::text AS "dueDate"
    FROM bayanat.dpia_measures m JOIN bayanat.dpias d ON d.dpia_id = m.dpia_id
    WHERE m.status_code IN ('PLANNED', 'IN_PROGRESS') AND m.due_date < CURRENT_DATE AND m.overdue_reminded_at IS NULL
  `;
  for (const m of late) {
    await notifyAll([m.owner], { title: `Measure overdue — ${m.reference}`, body: `${m.text.slice(0, 200)} (due ${m.dueDate})`, href: `/privacy/dpia/${m.dpiaId}?tab=risks` });
    await sql`UPDATE bayanat.dpia_measures SET overdue_reminded_at = now() WHERE measure_id = ${m.id}`;
  }
  return { reviewsDue: due.length, measuresOverdue: late.length };
}

export type DpiaWatchResult = { suggestions: Awaited<ReturnType<typeof refreshDpiaSuggestions>>; changes: { checked: number; withChanges: number }; reminders: { reviewsDue: number; measuresOverdue: number } };

/** The whole daily check. */
export async function runDpiaWatch(): Promise<DpiaWatchResult> {
  const suggestions = await refreshDpiaSuggestions();
  const changes = await checkAllChanges();
  const reminders = await sendReminders();
  await markScheduledJobRan("DPIA_WATCH");
  return { suggestions, changes, reminders };
}

export async function lastDpiaWatchRun(): Promise<string | null> {
  const [r] = await sql<{ at: string | null }[]>`SELECT last_run_at::text AS at FROM bayanat.scheduled_job_areas WHERE area_code = 'DPIA_WATCH'`;
  return r?.at ?? null;
}
