// Personal data breach register (db/207, db/212): shared by the server and the screens.
import type { DpiaAsset, DpiaFacts } from "./dpia-types";

export const BREACH_STATUSES = ["REPORTED", "INVESTIGATING", "CONTAINED", "CLOSED", "NOT_A_BREACH"] as const;
export type BreachStatus = (typeof BREACH_STATUSES)[number];
export const BREACH_OPEN: BreachStatus[] = ["REPORTED", "INVESTIGATING", "CONTAINED"];
export const isBreachOpen = (s: BreachStatus) => BREACH_OPEN.includes(s);

/** Confidentiality (disclosed or accessed), integrity (altered), availability (lost or destroyed). */
export const BREACH_TYPES = ["CONFIDENTIALITY", "INTEGRITY", "AVAILABILITY"] as const;
export type BreachType = (typeof BREACH_TYPES)[number];
export const BREACH_CAUSES = ["CYBER_ATTACK", "UNAUTHORISED_ACCESS", "MISDIRECTED", "LOST_DEVICE", "SYSTEM_ERROR", "INSIDER", "THIRD_PARTY", "OTHER"] as const;
export type BreachCause = (typeof BREACH_CAUSES)[number];
export const BREACH_REGULATIONS = ["PDPL", "GDPR", "PIPEDA", "LAW25"] as const;
export type BreachRegulation = (typeof BREACH_REGULATIONS)[number];

/** UNLIKELY: no notification needed (the reason is recorded); RISK: some laws require
 *  notifying the regulator; HIGH: every law requires notifying the regulator and the
 *  people concerned. */
export const BREACH_RISKS = ["UNLIKELY", "RISK", "HIGH"] as const;
export type BreachRisk = (typeof BREACH_RISKS)[number];
const RANK: Record<BreachRisk, number> = { UNLIKELY: 0, RISK: 1, HIGH: 2 };

/**
 * What each law asks after a breach. "regulatorFrom" is the lowest risk at which the
 * regulator must be told; the people concerned are told when the risk is HIGH under all
 * four. Canadian thresholds ("real risk of significant harm", "risk of serious injury")
 * are read as HIGH.
 *  - PDPL Implementing Regulation art. 24: SDAIA within 72 hours.
 *  - GDPR art. 33–34: the supervisory authority within 72 hours.
 *  - PIPEDA s. 10.1 and the Breach of Security Safeguards Regulations: the OPC as soon
 *    as feasible; every breach recorded and kept 24 months.
 *  - Québec Private Sector Act ss. 3.5–3.8 (Law 25) and the Regulation respecting
 *    confidentiality incidents: the CAI promptly; every incident in a register kept
 *    at least 5 years.
 * Breaches are never deleted here, which meets both record-keeping periods.
 */
export type BreachLaw = { authority: string; hours: number | null; regulatorFrom: BreachRisk; keepMonths: number | null };
export const BREACH_LAWS: Record<BreachRegulation, BreachLaw> = {
  PDPL:   { authority: "SDAIA (Saudi Data & AI Authority)", hours: 72, regulatorFrom: "RISK", keepMonths: null },
  GDPR:   { authority: "Lead supervisory authority", hours: 72, regulatorFrom: "RISK", keepMonths: null },
  PIPEDA: { authority: "Office of the Privacy Commissioner of Canada (OPC)", hours: null, regulatorFrom: "HIGH", keepMonths: 24 },
  LAW25:  { authority: "Commission d'accès à l'information du Québec (CAI)", hours: null, regulatorFrom: "HIGH", keepMonths: 60 },
};

/** The regulator's name in the reader's language while it is still the law's default;
 *  a name someone typed is shown as typed. */
export const authorityLabel = (n: { regulation: BreachRegulation; authorityName: string | null }, names: Record<BreachRegulation, string>) =>
  !n.authorityName || n.authorityName === BREACH_LAWS[n.regulation].authority ? names[n.regulation] : n.authorityName;

/** Reminder when this many hours or fewer are left. */
export const DUE_SOON_HOURS = 24;

/** "41 h" up to two days, then "3 d 5 h", from the screen's two templates. */
export function formatSpan(ms: number, hoursN: string, daysHours: string): string {
  const hours = Math.max(0, Math.round(Math.abs(ms) / 3600_000));
  return hours < 48 ? hoursN.replace("{n}", String(hours)) : daysHours.replace("{d}", String(Math.floor(hours / 24))).replace("{h}", String(hours % 24));
}

/** Until the risk is assessed, every regulator notice is treated as required. */
export const noticeRequired = (law: BreachRegulation, risk: BreachRisk | null) => risk === null || RANK[risk] >= RANK[BREACH_LAWS[law].regulatorFrom];
export const subjectsRequired = (risk: BreachRisk | null) => risk === "HIGH";
export const noticeDeadline = (law: BreachRegulation, discoveredAt: string) => {
  const h = BREACH_LAWS[law].hours;
  return h == null ? null : new Date(new Date(discoveredAt).getTime() + h * 3600_000).toISOString();
};

/** Where a regulator notice stands. ASAP: a law with no fixed deadline ("as soon as
 *  feasible", "promptly"), not notified yet. NOTIFIED: done under such a law. */
export type AuthorityState = "NOT_REQUIRED" | "NOTIFIED" | "ON_TIME" | "LATE" | "ASAP" | "DUE" | "DUE_SOON" | "OVERDUE";
const URGENCY: AuthorityState[] = ["OVERDUE", "DUE_SOON", "ASAP", "DUE", "LATE", "ON_TIME", "NOTIFIED", "NOT_REQUIRED"];

export type BreachNotice = {
  regulation: BreachRegulation; authorityName: string | null; notifiedAt: string | null; reference: string | null; lateReason: string | null;
  required: boolean; deadline: string | null; state: AuthorityState;
};
type NoticeRow = Pick<BreachNotice, "regulation" | "authorityName" | "notifiedAt" | "reference" | "lateReason">;

export function describeNotice(n: NoticeRow, b: { riskLevel: BreachRisk | null; discoveredAt: string; statusCode: BreachStatus }, now = Date.now()): BreachNotice {
  const required = b.statusCode !== "NOT_A_BREACH" && noticeRequired(n.regulation, b.riskLevel);
  const deadline = noticeDeadline(n.regulation, b.discoveredAt);
  const due = deadline ? new Date(deadline).getTime() : null;
  const state: AuthorityState = n.notifiedAt
    ? due == null ? "NOTIFIED" : new Date(n.notifiedAt).getTime() <= due ? "ON_TIME" : "LATE"
    : !required ? "NOT_REQUIRED"
    : due == null ? "ASAP"
    : now > due ? "OVERDUE"
    : due - now <= DUE_SOON_HOURS * 3600_000 ? "DUE_SOON" : "DUE";
  return { ...n, required, deadline, state };
}

/** The most urgent notice: what the register shows for the breach. */
export function overallNotice(notices: BreachNotice[]): { state: AuthorityState; deadline: string | null } {
  const top = [...notices].sort((a, b) => URGENCY.indexOf(a.state) - URGENCY.indexOf(b.state))[0];
  return top ? { state: top.state, deadline: top.notifiedAt ? null : top.deadline } : { state: "NOT_REQUIRED", deadline: null };
}

export type SubjectsState = "NOT_REQUIRED" | "NOTIFIED" | "EXEMPT" | "PENDING";
export function subjectsState(b: { riskLevel: BreachRisk | null; subjectsNotifiedAt: string | null; subjectsExemption: string | null; statusCode: BreachStatus }): SubjectsState {
  if (b.subjectsNotifiedAt) return "NOTIFIED";
  if (b.statusCode === "NOT_A_BREACH" || !subjectsRequired(b.riskLevel)) return "NOT_REQUIRED";
  return b.subjectsExemption ? "EXEMPT" : "PENDING";
}

/** The catalog's suggestion for the risk, from the personal data in the affected assets. */
export type RiskSuggestion = { level: BreachRisk; reasons: ("NO_PI" | "PI" | "SENSITIVE_PI" | "LARGE_SCALE" | "UNENCRYPTED_PI")[] };
export function suggestRisk(facts: DpiaFacts | null): RiskSuggestion | null {
  if (!facts || facts.scope.tableCount + facts.scope.columnCount === 0) return null;
  if (facts.personalData.columnCount === 0) return { level: "UNLIKELY", reasons: ["NO_PI"] };
  const has = (c: string) => facts.flags.some((f) => f.code === c);
  const reasons: RiskSuggestion["reasons"] = [];
  if (has("SENSITIVE_PI")) reasons.push("SENSITIVE_PI");
  if (has("LARGE_SCALE")) reasons.push("LARGE_SCALE");
  if (has("UNENCRYPTED_PI")) reasons.push("UNENCRYPTED_PI");
  return reasons.length ? { level: "HIGH", reasons } : { level: "RISK", reasons: ["PI"] };
}

/** The largest personal-data table in scope: an upper bound for the people affected. */
export const largestPiTable = (facts: DpiaFacts | null) =>
  facts?.scope.tables.filter((t) => t.piColumns > 0 && t.rows != null).reduce<{ name: string; rows: number } | null>(
    (m, t) => (m && m.rows >= (t.rows ?? 0) ? m : { name: t.name, rows: t.rows ?? 0 }), null) ?? null;

export type BreachSummary = {
  breachId: number; referenceCode: string; title: string; statusCode: BreachStatus;
  discoveredAt: string; riskLevel: BreachRisk | null; regulations: BreachRegulation[];
  /** One per law that applies, each with its regulator, rule and state. */
  notices: BreachNotice[];
  /** The most urgent of the notices, and its deadline when it has one. */
  authorityState: AuthorityState; authorityDeadline: string | null;
  subjectsNotifiedAt: string | null; subjectsExemption: string | null; subjectsState: SubjectsState;
  subjectsEstimate: number | null; ownerUserId: string | null; ownerName: string | null;
  reportedByUserId: string; reportedByName: string | null;
  piColumns: number; categories: string[]; assetCount: number;
  closedAt: string | null; createdAt: string;
};

export type BreachEvent = { eventId: number; code: string; note: string | null; user: string | null; at: string };

export type BreachDetail = BreachSummary & {
  description: string | null; occurredFrom: string | null; occurredTo: string | null; howDiscovered: string | null;
  breachTypes: BreachType[]; causeCode: BreachCause | null;
  recordsEstimate: number | null; riskReason: string | null; consequences: string | null;
  containment: string | null; prevention: string | null; containedAt: string | null;
  subjectsMethod: string | null; subjectsNotified: number | null; closureNote: string | null;
  assets: DpiaAsset[]; facts: DpiaFacts | null; factsAt: string | null;
  riskSuggestion: RiskSuggestion | null; largestPiTable: { name: string; rows: number } | null;
  events: BreachEvent[];
};

export type BreachPermissions = { canManage: boolean; canDelete: boolean; userId: string };
