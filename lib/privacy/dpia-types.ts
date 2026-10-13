// Data protection impact assessments (db/186) — the shapes and the small pure rules
// shared by the server and the screens. No database access here.

export type DpiaStatus = "SCREENING" | "NOT_REQUIRED" | "ASSESSMENT" | "IN_REVIEW" | "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED";
export const DPIA_STATUSES: DpiaStatus[] = ["SCREENING", "NOT_REQUIRED", "ASSESSMENT", "IN_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"];
/** Statuses that are a recorded outcome: the content is frozen until it is reopened. */
export const DPIA_CLOSED: DpiaStatus[] = ["NOT_REQUIRED", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"];
export const isClosed = (s: DpiaStatus) => DPIA_CLOSED.includes(s);

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export const MEASURE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type MeasureStatus = (typeof MEASURE_STATUSES)[number];
export const CONSULTATION_CODES = ["NOT_RECORDED", "NOT_NEEDED", "SUBMITTED", "CLEARED"] as const;
export type ConsultationCode = (typeof CONSULTATION_CODES)[number];

/** Likelihood × severity, each 1 (low) to 3 (high). */
export function riskLevel(likelihood: number | null, severity: number | null): RiskLevel | null {
  if (!likelihood || !severity) return null;
  const score = likelihood * severity;
  return score >= 6 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";
}
const RANK: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
export const maxLevel = (levels: (RiskLevel | null)[]): RiskLevel | null =>
  levels.reduce<RiskLevel | null>((m, l) => (l && (!m || RANK[l] > RANK[m]) ? l : m), null);

export type DpiaRisk = {
  riskId: number; title: string; description: string | null; sourceFlag: string | null;
  inherentLikelihood: number; inherentSeverity: number; residualLikelihood: number | null; residualSeverity: number | null;
};
export const inherentLevel = (r: DpiaRisk) => riskLevel(r.inherentLikelihood, r.inherentSeverity)!;
/** What remains after the measures; a risk not yet re-scored still counts at its inherent level. */
export const residualLevel = (r: DpiaRisk) => riskLevel(r.residualLikelihood, r.residualSeverity) ?? inherentLevel(r);
export const overallInherent = (risks: DpiaRisk[]) => maxLevel(risks.map(inherentLevel));
export const overallResidual = (risks: DpiaRisk[]) => maxLevel(risks.map(residualLevel));

export type DpiaMeasure = {
  measureId: number; riskId: number | null; text: string; ownerUserId: string | null; ownerName: string | null;
  dueDate: string | null; status: MeasureStatus; completedDate: string | null; note: string | null; overdue: boolean;
};

export type DpiaQuestion = {
  questionId: number; code: string; stage: "SCREENING" | "ASSESSMENT"; section: string;
  text: string; textTranslations: Record<string, string> | null;
  help: string | null; helpTranslations: Record<string, string> | null;
  reference: string | null; autoCode: string | null; required: boolean;
  answerCode: "YES" | "NO" | null; answerText: string | null;
};

export type DpiaTemplate = {
  templateId: number; code: string; name: string; nameTranslations: Record<string, string> | null;
  regulation: string | null; regulationTranslations: Record<string, string> | null;
  description: string | null; descriptionTranslations: Record<string, string> | null;
  threshold: number; isDefault: boolean;
};

export type DpiaAsset = { typeCode: string; id: number; name: string; typeName: string; sublabel: string | null; href: string | null; isSubject: boolean };

// ── What the catalog says about the linked assets ───────────────────────────
export type DpiaFlagCode =
  | "NO_SCOPE" | "NO_PI" | "SENSITIVE_PI" | "LARGE_SCALE" | "MULTI_SOURCE" | "EXTERNAL_SHARING" | "CROSS_BORDER"
  | "UNENCRYPTED_PI" | "NO_RETENTION" | "DOWNSTREAM_UNCLASSIFIED";
export type DpiaFlag = { code: DpiaFlagCode; n: number; detail: string | null };

export type DpiaFacts = {
  generatedAt: string;
  subject: { typeCode: string; typeName: string; name: string; description: string | null; attributes: { code: string; label: string; value: string }[] } | null;
  /** Custom assets linked to what is in scope: who performs it, who receives the data. */
  related: { relation: string; typeName: string; name: string; href: string | null }[];
  scope: {
    sources: string[]; tableCount: number; columnCount: number; rowEstimate: number | null;
    tables: { entityId: number; name: string; schema: string; source: string; rows: number | null; piColumns: number }[];
  };
  personalData: {
    columnCount: number; unencryptedCount: number;
    categories: { code: string; name: string; count: number; sensitive: boolean }[];
    columns: { column: string; table: string; source: string; term: string | null; category: string | null; classification: string | null; encrypted: boolean }[];
  };
  flows: {
    systems: string[];
    tables: { source: string; schema: string; table: string; columns: number; unclassified: number; hops: number }[];
  };
  sharing: { reference: string | null; title: string; counterparty: string | null; scope: string; status: string; legalBasis: string | null; purpose: string | null; crossBorder: boolean; personalData: boolean }[];
  access: { grantCount: number; userCount: number; grants: { user: string; asset: string; purpose: string | null; legalBasis: string | null }[] };
  retention: {
    categories: { name: string; sensitivity: string | null; schedule: string | null; tables: number }[];
    tablesWithoutCategory: string[];
    holds: { reference: string; name: string }[];
  };
  owners: string[];
  flags: DpiaFlag[];
};

/** The catalog findings that become a suggested risk, with a starting score. */
export const SUGGESTED_RISKS: Partial<Record<DpiaFlagCode, { likelihood: number; severity: number }>> = {
  SENSITIVE_PI: { likelihood: 2, severity: 3 },
  LARGE_SCALE: { likelihood: 2, severity: 3 },
  MULTI_SOURCE: { likelihood: 2, severity: 2 },
  EXTERNAL_SHARING: { likelihood: 2, severity: 2 },
  CROSS_BORDER: { likelihood: 2, severity: 3 },
  UNENCRYPTED_PI: { likelihood: 2, severity: 3 },
  NO_RETENTION: { likelihood: 3, severity: 2 },
  DOWNSTREAM_UNCLASSIFIED: { likelihood: 2, severity: 2 },
};

export type DpiaSummary = {
  dpiaId: number; referenceCode: string; title: string; templateName: string; templateNameTranslations: Record<string, string> | null;
  statusCode: DpiaStatus; screeningOutcome: "REQUIRED" | "NOT_REQUIRED" | null;
  subject: { typeCode: string; id: number; name: string; typeName: string } | null;
  ownerUserId: string | null; ownerName: string | null; createdByUserId: string | null;
  inherentLevel: RiskLevel | null; residualLevel: RiskLevel | null;
  measuresTotal: number; measuresOpen: number; measuresOverdue: number;
  decidedAt: string | null; decidedBy: string | null; nextReviewDate: string | null; reviewDue: boolean;
  versionNo: number; createdAt: string; updatedAt: string;
};

export type DpiaEvent = { eventId: number; code: string; note: string | null; user: string | null; at: string };
export type DpiaVersionInfo = { versionNo: number; decisionCode: string; by: string | null; at: string };

export type DpiaDetail = DpiaSummary & {
  description: string | null; template: DpiaTemplate;
  screeningNote: string | null; screeningBy: string | null; screeningAt: string | null;
  submittedBy: string | null; submittedAt: string | null;
  dpoOpinion: string | null; conditions: string | null;
  consultationCode: ConsultationCode; consultationNote: string | null;
  assets: DpiaAsset[]; questions: DpiaQuestion[]; risks: DpiaRisk[]; measures: DpiaMeasure[];
  facts: DpiaFacts | null; factsAt: string | null;
  events: DpiaEvent[]; versions: DpiaVersionInfo[];
};

export type DpiaPermissions = { canEdit: boolean; canReview: boolean; canOverrideScreening: boolean; canDelete: boolean; canReopen: boolean; isAuthor: boolean; userId: string };

/** What the screening answers add up to under the template's rule. */
export function screeningRecommendation(questions: DpiaQuestion[], threshold: number): { yes: number; answered: number; total: number; required: boolean } {
  const s = questions.filter((x) => x.stage === "SCREENING");
  const yes = s.filter((x) => x.answerCode === "YES").length;
  return { yes, answered: s.filter((x) => x.answerCode != null).length, total: s.length, required: yes >= threshold };
}
