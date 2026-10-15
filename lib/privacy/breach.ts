// Personal data breach register (db/207). A breach is reported by anyone, handled by a
// data protection officer (or an admin, or the handler they assign), and kept for good:
// one that turns out not to involve personal data is closed as "Not a breach", never
// deleted. The affected assets bring the catalog's facts about the personal data in
// them (lib/privacy/dpia-facts.ts), which suggest the risk and the people affected.
import { sql } from "../db";
import { createNotification } from "../queries/notifications";
import type { SessionUser } from "../types";
import { buildDpiaFacts, describeAssets, type AssetRef } from "./dpia-facts";
import type { DpiaFacts } from "./dpia-types";
import {
  authorityDeadline, authorityRequired, authorityState, largestPiTable, subjectsRequired, subjectsState, suggestRisk, isBreachOpen,
  BREACH_CAUSES, BREACH_REGULATIONS, BREACH_RISKS, BREACH_TYPES,
  type BreachDetail, type BreachEvent, type BreachPermissions, type BreachRisk, type BreachStatus, type BreachSummary,
} from "./breach-types";

export type BreachError = { error: string; code: string };
const fail = (code: string, error: string): BreachError => ({ code, error });
const ASSET_TYPES = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"];
const validAssetType = (t: string) => ASSET_TYPES.includes(t) || /^CUSTOM:[A-Z0-9_]{1,30}$/.test(t);
const text = (v: unknown, max = 20000): string | null => { const s = typeof v === "string" ? v.trim() : ""; return s ? s.slice(0, max) : null; };
const count = (v: unknown): number | null => { if (v === null || v === "" || v === undefined) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : NaN; };
/** An ISO date-time from the screen (which sends UTC); null when empty, NaN-marked when invalid. */
const instant = (v: unknown): string | null | "invalid" => {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
};
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => allowed.includes(x as T)))] : []);
const ISO = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

// ── Who may do what ──────────────────────────────────────────────────────────
/** Data protection officers and admins see and handle every breach. */
export const handlesAllBreaches = (role: string) => role === "ADMIN" || role === "OFFICER";

export function breachPermissions(session: SessionUser, b: { ownerUserId: string | null }): BreachPermissions {
  return { canManage: handlesAllBreaches(session.role) || b.ownerUserId === session.userId, canDelete: false, userId: session.userId };
}

export async function canViewBreach(session: SessionUser, breachId: number): Promise<boolean> {
  if (handlesAllBreaches(session.role)) {
    const [r] = await sql`SELECT 1 FROM bayanat.privacy_breaches WHERE breach_id = ${breachId}`;
    return !!r;
  }
  const [r] = await sql`SELECT 1 FROM bayanat.privacy_breaches WHERE breach_id = ${breachId}
                        AND (owner_user_id = ${session.userId} OR reported_by_user_id = ${session.userId})`;
  return !!r;
}

// ── Register ─────────────────────────────────────────────────────────────────
type Row = Omit<BreachSummary, "authorityDeadline" | "authorityState" | "subjectsState" | "piColumns" | "categories"> & { facts: DpiaFacts | null };
const COLS = () => sql.unsafe(`
  b.breach_id AS "breachId", b.reference_code AS "referenceCode", b.title_text AS title, b.status_code AS "statusCode",
  ${ISO("b.discovered_at")} AS "discoveredAt", b.risk_level_code AS "riskLevel",
  ${ISO("b.authority_notified_at")} AS "authorityNotifiedAt", ${ISO("b.subjects_notified_at")} AS "subjectsNotifiedAt",
  b.subjects_exemption_text AS "subjectsExemption", b.subjects_estimate_int AS "subjectsEstimate",
  b.owner_user_id AS "ownerUserId", ou.full_name AS "ownerName", b.reported_by_user_id AS "reportedByUserId", ru.full_name AS "reportedByName",
  (SELECT count(*)::int FROM bayanat.privacy_breach_assets a WHERE a.breach_id = b.breach_id) AS "assetCount",
  ${ISO("b.closed_at")} AS "closedAt", ${ISO("b.created_at")} AS "createdAt", b.facts_json AS facts
`);
const FROM = sql`FROM bayanat.privacy_breaches b
  LEFT JOIN bayanat.users ou ON ou.user_id = b.owner_user_id
  LEFT JOIN bayanat.users ru ON ru.user_id = b.reported_by_user_id`;

function summarise(r: Row): BreachSummary {
  const { facts, ...rest } = r;
  return {
    ...rest,
    authorityDeadline: authorityDeadline(r.discoveredAt),
    authorityState: authorityState(r),
    subjectsState: subjectsState(r),
    piColumns: facts?.personalData.columnCount ?? 0,
    categories: (facts?.personalData.categories ?? []).map((c) => c.name),
  };
}

export async function listBreaches(session: SessionUser): Promise<BreachSummary[]> {
  const all = handlesAllBreaches(session.role);
  const rows = await sql<Row[]>`
    SELECT ${COLS()} ${FROM}
    WHERE ${all ? sql`true` : sql`(b.owner_user_id = ${session.userId} OR b.reported_by_user_id = ${session.userId})`}
    ORDER BY (b.status_code IN ('REPORTED', 'INVESTIGATING', 'CONTAINED')) DESC, b.discovered_at DESC
  `;
  return rows.map(summarise);
}

export async function getBreach(breachId: number): Promise<BreachDetail | null> {
  const [r] = await sql<(Row & Record<string, unknown>)[]>`
    SELECT ${COLS()},
      b.description_text AS description, ${sql.unsafe(ISO("b.occurred_from_at"))} AS "occurredFrom", ${sql.unsafe(ISO("b.occurred_to_at"))} AS "occurredTo",
      b.how_discovered_text AS "howDiscovered", b.breach_types AS "breachTypes", b.cause_code AS "causeCode", b.regulations,
      b.records_estimate_int AS "recordsEstimate", b.risk_reason_text AS "riskReason", b.consequences_text AS consequences,
      b.containment_text AS containment, b.prevention_text AS prevention, ${sql.unsafe(ISO("b.contained_at"))} AS "containedAt",
      b.authority_name_text AS "authorityName", b.authority_reference_text AS "authorityReference", b.authority_late_reason_text AS "authorityLateReason",
      b.subjects_method_text AS "subjectsMethod", b.subjects_notified_int AS "subjectsNotified", b.closure_note_text AS "closureNote",
      ${sql.unsafe(ISO("b.facts_at"))} AS "factsAt"
    ${FROM} WHERE b.breach_id = ${breachId}
  `;
  if (!r) return null;
  const refs = await sql<{ typeCode: string; id: number }[]>`
    SELECT asset_type_code AS "typeCode", asset_id AS id FROM bayanat.privacy_breach_assets WHERE breach_id = ${breachId} ORDER BY added_at`;
  const events = await sql<BreachEvent[]>`
    SELECT e.event_id AS "eventId", e.event_code AS code, e.note_text AS note, coalesce(u.full_name, e.user_id) AS "user", ${sql.unsafe(ISO("e.created_at"))} AS at
    FROM bayanat.privacy_breach_events e LEFT JOIN bayanat.users u ON u.user_id = e.user_id
    WHERE e.breach_id = ${breachId} ORDER BY e.created_at DESC, e.event_id DESC
  `;
  const { facts: rawFacts, ...rest } = r;
  const facts = (rawFacts as DpiaFacts | null) ?? null;
  return {
    ...(rest as unknown as BreachDetail),
    ...summarise(r as Row),
    assets: await describeAssets(refs.map((x) => ({ typeCode: x.typeCode, id: Number(x.id), isSubject: false }))),
    facts, riskSuggestion: suggestRisk(facts), largestPiTable: largestPiTable(facts),
    events,
  };
}

export async function logBreachEvent(breachId: number, code: string, userId: string | null, note: string | null = null): Promise<void> {
  await sql`INSERT INTO bayanat.privacy_breach_events (breach_id, event_code, note_text, user_id) VALUES (${breachId}, ${code}, ${note}, ${userId})`;
}

async function refreshFacts(breachId: number): Promise<void> {
  const refs = await sql<AssetRef[]>`SELECT asset_type_code AS "typeCode", asset_id AS id FROM bayanat.privacy_breach_assets WHERE breach_id = ${breachId}`;
  const facts = refs.length ? await buildDpiaFacts(refs.map((r) => ({ typeCode: r.typeCode, id: Number(r.id) })), null) : null;
  await sql`UPDATE bayanat.privacy_breaches SET facts_json = ${facts ? sql.json(facts as never) : null}, facts_at = now(), updated_at = now() WHERE breach_id = ${breachId}`;
}

/** Officers handle breaches; when there are none, admins do. */
async function handlers(): Promise<string[]> {
  const officers = await sql<{ id: string }[]>`SELECT user_id AS id FROM bayanat.users WHERE role = 'OFFICER' AND is_active`;
  if (officers.length) return officers.map((o) => o.id);
  return (await sql<{ id: string }[]>`SELECT user_id AS id FROM bayanat.users WHERE role = 'ADMIN' AND is_active`).map((o) => o.id);
}

export async function notifyBreach(breachId: number, recipients: (string | null)[], n: { title: string; body: string; severity?: "INFO" | "WARNING" | "ERROR" }, except?: string): Promise<void> {
  for (const userId of [...new Set(recipients.filter((x): x is string => !!x && x !== except))]) {
    await createNotification({ userId, type: "REVIEW", title: n.title, body: n.body, severity: n.severity ?? "WARNING",
      actionLabel: "Open the breach", actionHref: `/privacy/breaches/${breachId}` }).catch(() => {});
  }
}
export const breachHandlers = handlers;

// ── Report ───────────────────────────────────────────────────────────────────
export async function createBreach(
  input: { title: unknown; description?: unknown; discoveredAt?: unknown; ownerUserId?: unknown; assets?: unknown },
  session: SessionUser,
): Promise<{ breachId: number } | BreachError> {
  const title = text(input.title, 255);
  if (!title) return fail("TITLE_REQUIRED", "Describe the breach in a short title.");
  const discovered = instant(input.discoveredAt) ?? new Date().toISOString();
  if (discovered === "invalid") return fail("DATE_INVALID", "Invalid date.");
  if (new Date(discovered).getTime() > Date.now() + 5 * 60_000) return fail("DISCOVERED_FUTURE", "The discovery time cannot be in the future.");
  let owner: string | null = null;
  if (handlesAllBreaches(session.role) && text(input.ownerUserId, 100)) {
    owner = text(input.ownerUserId, 100);
    const [u] = await sql`SELECT 1 FROM bayanat.users WHERE user_id = ${owner} AND is_active`;
    if (!u) return fail("OWNER_UNKNOWN", "Unknown handler.");
  }
  const assets = Array.isArray(input.assets) ? (input.assets as { typeCode?: unknown; id?: unknown }[])
    .map((a) => ({ typeCode: String(a.typeCode ?? ""), id: Number(a.id) })).filter((a) => validAssetType(a.typeCode) && Number.isInteger(a.id)) : [];

  const [{ n }] = await sql<{ n: number }[]>`SELECT nextval('bayanat.breach_reference_seq')::int AS n`;
  const reference = `BR-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  const [row] = await sql<{ breachId: number }[]>`
    INSERT INTO bayanat.privacy_breaches (reference_code, title_text, description_text, discovered_at, owner_user_id, reported_by_user_id)
    VALUES (${reference}, ${title}, ${text(input.description)}, ${discovered}, ${owner}, ${session.userId})
    RETURNING breach_id AS "breachId"
  `;
  for (const a of assets) {
    await sql`INSERT INTO bayanat.privacy_breach_assets (breach_id, asset_type_code, asset_id, added_by_user_id)
              VALUES (${row.breachId}, ${a.typeCode}, ${a.id}, ${session.userId}) ON CONFLICT DO NOTHING`;
  }
  if (assets.length) await refreshFacts(row.breachId);
  await logBreachEvent(row.breachId, "CREATED", session.userId);
  await notifyBreach(row.breachId, [...(await handlers()), owner], {
    title: `Personal data breach reported — ${reference}`,
    body: `${title}. The regulator must be notified by ${utc(authorityDeadline(discovered))} unless the breach is unlikely to put people at risk.`,
    severity: "ERROR",
  }, session.userId);
  return { breachId: row.breachId };
}

// ── Editing ──────────────────────────────────────────────────────────────────
async function manageable(session: SessionUser, breachId: number): Promise<{ statusCode: BreachStatus; ownerUserId: string | null; referenceCode: string; title: string } | BreachError> {
  const [b] = await sql<{ statusCode: BreachStatus; ownerUserId: string | null; referenceCode: string; title: string }[]>`
    SELECT status_code AS "statusCode", owner_user_id AS "ownerUserId", reference_code AS "referenceCode", title_text AS title
    FROM bayanat.privacy_breaches WHERE breach_id = ${breachId}`;
  if (!b) return fail("NOT_FOUND", "Not found");
  if (!breachPermissions(session, b).canManage) return fail("FORBIDDEN", "Only a data protection officer, an admin or the assigned handler can change this breach.");
  return b;
}

// Field → column, with how the value is read. Anything not listed cannot be changed here.
const FIELDS: Record<string, { col: string; read: (v: unknown) => unknown }> = {
  title: { col: "title_text", read: (v) => text(v, 255) ?? "invalid" },
  description: { col: "description_text", read: (v) => text(v) },
  discoveredAt: { col: "discovered_at", read: (v) => instant(v) ?? "invalid" },
  occurredFrom: { col: "occurred_from_at", read: instant },
  occurredTo: { col: "occurred_to_at", read: instant },
  howDiscovered: { col: "how_discovered_text", read: (v) => text(v) },
  breachTypes: { col: "breach_types", read: (v) => pick(v, BREACH_TYPES) },
  causeCode: { col: "cause_code", read: (v) => (v == null || v === "" ? null : (BREACH_CAUSES as readonly string[]).includes(String(v)) ? String(v) : "invalid") },
  regulations: { col: "regulations", read: (v) => pick(v, BREACH_REGULATIONS) },
  subjectsEstimate: { col: "subjects_estimate_int", read: count },
  recordsEstimate: { col: "records_estimate_int", read: count },
  riskLevel: { col: "risk_level_code", read: (v) => (v == null || v === "" ? null : (BREACH_RISKS as readonly string[]).includes(String(v)) ? String(v) : "invalid") },
  riskReason: { col: "risk_reason_text", read: (v) => text(v) },
  consequences: { col: "consequences_text", read: (v) => text(v) },
  containment: { col: "containment_text", read: (v) => text(v) },
  prevention: { col: "prevention_text", read: (v) => text(v) },
  authorityName: { col: "authority_name_text", read: (v) => text(v, 255) },
  authorityNotifiedAt: { col: "authority_notified_at", read: instant },
  authorityReference: { col: "authority_reference_text", read: (v) => text(v, 255) },
  authorityLateReason: { col: "authority_late_reason_text", read: (v) => text(v) },
  subjectsNotifiedAt: { col: "subjects_notified_at", read: instant },
  subjectsMethod: { col: "subjects_method_text", read: (v) => text(v) },
  subjectsNotified: { col: "subjects_notified_int", read: count },
  subjectsExemption: { col: "subjects_exemption_text", read: (v) => text(v) },
};

export async function updateBreach(breachId: number, input: Record<string, unknown>, session: SessionUser): Promise<{ ok: true } | BreachError> {
  const h = await manageable(session, breachId);
  if ("error" in h) return h;
  const sets: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input)) {
    if (field === "ownerUserId") continue;
    const f = FIELDS[field];
    if (!f) continue;
    const v = f.read(value);
    if (v === "invalid" || (typeof v === "number" && Number.isNaN(v))) return fail("FIELD_INVALID", `Invalid value for ${field}.`);
    sets[f.col] = v;
  }
  for (const col of ["discovered_at", "authority_notified_at", "subjects_notified_at"]) {
    if (typeof sets[col] === "string" && new Date(sets[col] as string).getTime() > Date.now() + 5 * 60_000) return fail("DATE_FUTURE", "A date cannot be in the future.");
  }
  let newOwner: string | null | undefined;
  if ("ownerUserId" in input) {
    if (!handlesAllBreaches(session.role)) return fail("FORBIDDEN", "Only a data protection officer or an admin can assign the handler.");
    newOwner = text(input.ownerUserId, 100);
    if (newOwner) {
      const [u] = await sql`SELECT 1 FROM bayanat.users WHERE user_id = ${newOwner} AND is_active`;
      if (!u) return fail("OWNER_UNKNOWN", "Unknown handler.");
    }
    sets.owner_user_id = newOwner;
  }
  if (Object.keys(sets).length === 0) return { ok: true };
  // A corrected discovery time moves the deadline: its reminders start over.
  if (sets.discovered_at) { sets.due_reminded_at = null; sets.overdue_reminded_at = null; }

  const [before] = await sql<{ authorityNotifiedAt: string | null; subjectsNotifiedAt: string | null; riskLevel: BreachRisk | null }[]>`
    SELECT authority_notified_at AS "authorityNotifiedAt", subjects_notified_at AS "subjectsNotifiedAt", risk_level_code AS "riskLevel"
    FROM bayanat.privacy_breaches WHERE breach_id = ${breachId}`;
  await sql`UPDATE bayanat.privacy_breaches SET ${sql(sets as Record<string, never>)}, updated_at = now() WHERE breach_id = ${breachId}`;

  if (sets.risk_level_code !== undefined && sets.risk_level_code !== before.riskLevel) await logBreachEvent(breachId, "RISK", session.userId, String(sets.risk_level_code ?? ""));
  if (sets.authority_notified_at && !before.authorityNotifiedAt) await logBreachEvent(breachId, "AUTHORITY_NOTIFIED", session.userId, text(input.authorityReference, 255));
  if (sets.subjects_notified_at && !before.subjectsNotifiedAt) await logBreachEvent(breachId, "SUBJECTS_NOTIFIED", session.userId);
  if (newOwner !== undefined) {
    await logBreachEvent(breachId, "ASSIGNED", session.userId, newOwner);
    if (newOwner) await notifyBreach(breachId, [newOwner], { title: `Breach assigned to you — ${h.referenceCode}`, body: h.title }, session.userId);
  }
  const other = Object.keys(sets).filter((c) => !["risk_level_code", "authority_notified_at", "subjects_notified_at", "owner_user_id"].includes(c));
  if (other.length) await logBreachEvent(breachId, "UPDATED", session.userId);
  return { ok: true };
}

export async function changeBreachAsset(breachId: number, action: "ADD" | "REMOVE", typeCode: string, assetId: number, session: SessionUser): Promise<{ ok: true } | BreachError> {
  const h = await manageable(session, breachId);
  if ("error" in h) return h;
  if (!validAssetType(typeCode) || !Number.isInteger(assetId)) return fail("ASSET_INVALID", "Unknown asset.");
  if (action === "ADD") {
    await sql`INSERT INTO bayanat.privacy_breach_assets (breach_id, asset_type_code, asset_id, added_by_user_id)
              VALUES (${breachId}, ${typeCode}, ${assetId}, ${session.userId}) ON CONFLICT DO NOTHING`;
  } else {
    await sql`DELETE FROM bayanat.privacy_breach_assets WHERE breach_id = ${breachId} AND asset_type_code = ${typeCode} AND asset_id = ${assetId}`;
  }
  const [name] = await describeAssets([{ typeCode, id: assetId, isSubject: false }]);
  await logBreachEvent(breachId, action === "ADD" ? "ASSET_ADDED" : "ASSET_REMOVED", session.userId, name?.name ?? null);
  await refreshFacts(breachId);
  return { ok: true };
}

export async function refreshBreach(breachId: number, session: SessionUser): Promise<{ ok: true } | BreachError> {
  const h = await manageable(session, breachId);
  if ("error" in h) return h;
  await refreshFacts(breachId);
  return { ok: true };
}

export async function addBreachNote(breachId: number, note: unknown, session: SessionUser): Promise<{ ok: true } | BreachError> {
  const h = await manageable(session, breachId);
  if ("error" in h) return h;
  const n = text(note, 4000);
  if (!n) return fail("NOTE_REQUIRED", "Write the note first.");
  await logBreachEvent(breachId, "NOTE", session.userId, n);
  return { ok: true };
}

// ── Status ───────────────────────────────────────────────────────────────────
/** What still has to be recorded before the breach can be closed (codes for the screen). */
export function closeBlockers(b: BreachDetail): string[] {
  const missing: string[] = [];
  if (!b.riskLevel) missing.push("RISK");
  if (b.riskLevel === "UNLIKELY" && !b.riskReason) missing.push("RISK_REASON");
  if (authorityRequired(b.riskLevel) && !b.authorityNotifiedAt) missing.push("AUTHORITY");
  if (b.authorityState === "LATE" && !b.authorityLateReason) missing.push("LATE_REASON");
  if (subjectsRequired(b.riskLevel) && !b.subjectsNotifiedAt && !b.subjectsExemption) missing.push("SUBJECTS");
  if (!b.containment) missing.push("CONTAINMENT");
  return missing;
}

const MOVES: Record<string, BreachStatus> = { INVESTIGATE: "INVESTIGATING", CONTAIN: "CONTAINED", CLOSE: "CLOSED", NOT_A_BREACH: "NOT_A_BREACH", REOPEN: "INVESTIGATING" };

export async function moveBreach(breachId: number, action: unknown, note: unknown, session: SessionUser): Promise<{ ok: true } | BreachError & { missing?: string[] }> {
  const h = await manageable(session, breachId);
  if ("error" in h) return h;
  const to = MOVES[String(action)];
  if (!to) return fail("ACTION_INVALID", "Unknown action.");
  const open = isBreachOpen(h.statusCode);
  if (action === "REOPEN" ? open : !open) return fail("STATUS_INVALID", "Not possible in the breach's current status.");
  const n = text(note, 4000);
  if (to === "CLOSED") {
    const b = await getBreach(breachId);
    const missing = b ? closeBlockers(b) : [];
    if (missing.length) return { ...fail("CLOSE_INCOMPLETE", "Record what is still missing before closing."), missing };
  }
  if (to === "NOT_A_BREACH" && !n) return fail("NOTE_REQUIRED", "Explain why this is not a personal data breach.");
  await sql`
    UPDATE bayanat.privacy_breaches SET status_code = ${to}, updated_at = now(),
      contained_at = CASE WHEN ${to} = 'CONTAINED' THEN coalesce(contained_at, now()) ELSE contained_at END,
      closed_at = CASE WHEN ${to} IN ('CLOSED', 'NOT_A_BREACH') THEN now() ELSE NULL END,
      closure_note_text = CASE WHEN ${to} IN ('CLOSED', 'NOT_A_BREACH') THEN ${n} ELSE closure_note_text END
    WHERE breach_id = ${breachId}`;
  await logBreachEvent(breachId, action === "REOPEN" ? "REOPENED" : `STATUS_${to}`, session.userId, n);
  return { ok: true };
}

export async function breachUserOptions(): Promise<{ userId: string; name: string; role: string }[]> {
  return sql<{ userId: string; name: string; role: string }[]>`
    SELECT user_id AS "userId", full_name AS name, role FROM bayanat.users
    WHERE is_active AND role IN ('ADMIN', 'OFFICER', 'STEWARD') ORDER BY full_name`;
}
