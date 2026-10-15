// Personal data breach register (db/207): shared by the server and the screens.
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
export const BREACH_REGULATIONS = ["PDPL", "GDPR"] as const;
export type BreachRegulation = (typeof BREACH_REGULATIONS)[number];

/** UNLIKELY: no notification needed (the reason is recorded); RISK: notify the regulator;
 *  HIGH: notify the regulator and the people concerned. */
export const BREACH_RISKS = ["UNLIKELY", "RISK", "HIGH"] as const;
export type BreachRisk = (typeof BREACH_RISKS)[number];

/** PDPL (Implementing Regulation, art. 24) and GDPR (art. 33) both give 72 hours from
 *  becoming aware of the breach to notify the regulator. */
export const AUTHORITY_HOURS = 72;
/** Reminder when this many hours or fewer are left. */
export const DUE_SOON_HOURS = 24;

/** "41 h" up to two days, then "3 d 5 h", from the screen's two templates. */
export function formatSpan(ms: number, hoursN: string, daysHours: string): string {
  const hours = Math.max(0, Math.round(Math.abs(ms) / 3600_000));
  return hours < 48 ? hoursN.replace("{n}", String(hours)) : daysHours.replace("{d}", String(Math.floor(hours / 24))).replace("{h}", String(hours % 24));
}

export const authorityDeadline = (discoveredAt: string) => new Date(new Date(discoveredAt).getTime() + AUTHORITY_HOURS * 3600_000).toISOString();
/** Until the risk is assessed, the regulator deadline applies. */
export const authorityRequired = (risk: BreachRisk | null) => risk !== "UNLIKELY";
export const subjectsRequired = (risk: BreachRisk | null) => risk === "HIGH";

/** Where the regulator notification stands. */
export type AuthorityState = "NOT_REQUIRED" | "ON_TIME" | "LATE" | "DUE" | "DUE_SOON" | "OVERDUE";
export function authorityState(b: { riskLevel: BreachRisk | null; discoveredAt: string; authorityNotifiedAt: string | null; statusCode: BreachStatus }, now = Date.now()): AuthorityState {
  if (b.statusCode === "NOT_A_BREACH" || !authorityRequired(b.riskLevel)) return "NOT_REQUIRED";
  const deadline = new Date(authorityDeadline(b.discoveredAt)).getTime();
  if (b.authorityNotifiedAt) return new Date(b.authorityNotifiedAt).getTime() <= deadline ? "ON_TIME" : "LATE";
  if (now > deadline) return "OVERDUE";
  return deadline - now <= DUE_SOON_HOURS * 3600_000 ? "DUE_SOON" : "DUE";
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
  discoveredAt: string; authorityDeadline: string; riskLevel: BreachRisk | null;
  authorityNotifiedAt: string | null; subjectsNotifiedAt: string | null; subjectsExemption: string | null;
  authorityState: AuthorityState; subjectsState: SubjectsState;
  subjectsEstimate: number | null; ownerUserId: string | null; ownerName: string | null;
  reportedByUserId: string; reportedByName: string | null;
  piColumns: number; categories: string[]; assetCount: number;
  closedAt: string | null; createdAt: string;
};

export type BreachEvent = { eventId: number; code: string; note: string | null; user: string | null; at: string };

export type BreachDetail = BreachSummary & {
  description: string | null; occurredFrom: string | null; occurredTo: string | null; howDiscovered: string | null;
  breachTypes: BreachType[]; causeCode: BreachCause | null; regulations: BreachRegulation[];
  recordsEstimate: number | null; riskReason: string | null; consequences: string | null;
  containment: string | null; prevention: string | null; containedAt: string | null;
  authorityName: string | null; authorityReference: string | null; authorityLateReason: string | null;
  subjectsMethod: string | null; subjectsNotified: number | null; closureNote: string | null;
  assets: DpiaAsset[]; facts: DpiaFacts | null; factsAt: string | null;
  riskSuggestion: RiskSuggestion | null; largestPiTable: { name: string; rows: number } | null;
  events: BreachEvent[];
};

export type BreachPermissions = { canManage: boolean; canDelete: boolean; userId: string };
