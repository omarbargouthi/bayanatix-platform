// The sections of the Governance Framework, in display order. Shared by server and
// client code, so no database access here.
export const FW_SECTION_CODES = [
  "POLICY", "PROCESS", "STRATEGY", "OPERATING_MODEL", "ROADMAP", "STANDARD", "TRAINING", "COMMUNICATION", "REGULATORY",
] as const;
export type FwSectionCode = typeof FW_SECTION_CODES[number];

/** The key of a section in t.governance.sectionLabels / sectionDescs. */
export type FwSectionKey =
  "policy" | "process" | "strategy" | "operatingModel" | "roadmap" | "standard" | "training" | "communication" | "regulatory";

const KEYS: Record<FwSectionCode, FwSectionKey> = {
  POLICY: "policy", PROCESS: "process", STRATEGY: "strategy", OPERATING_MODEL: "operatingModel", ROADMAP: "roadmap",
  STANDARD: "standard", TRAINING: "training", COMMUNICATION: "communication", REGULATORY: "regulatory",
};

export const FW_SECTION_ICONS: Record<FwSectionCode, string> = {
  POLICY: "📋", PROCESS: "⚙️", STRATEGY: "🎯", OPERATING_MODEL: "🏛️", ROADMAP: "🗺️",
  STANDARD: "📐", TRAINING: "🎓", COMMUNICATION: "📣", REGULATORY: "⚖️",
};

export const isFwSection = (code: string): code is FwSectionCode => (FW_SECTION_CODES as readonly string[]).includes(code);
export const fwSectionKey = (code: string): FwSectionKey => KEYS[code as FwSectionCode] ?? "policy";
/** The section's part of the URL: /governance/framework/operating-model. */
export const fwSectionSlug = (code: string) => code.toLowerCase().replace(/_/g, "-");
export const fwSectionFromSlug = (slug: string): FwSectionCode | null => {
  const code = slug.toUpperCase().replace(/-/g, "_");
  return isFwSection(code) ? code : null;
};

// Roadmap execution -----------------------------------------------------------------

export const ROADMAP_ITEM_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED", "ON_HOLD", "CANCELLED"] as const;
export type RoadmapExecutionStatus = "NOT_TRACKED" | "NOT_STARTED" | "IN_PROGRESS" | "DELAYED" | "COMPLETED";

/**
 * Where a roadmap stands, from its milestones and deliverables (cancelled ones aside):
 * completed when all of them are; delayed when any is marked delayed or is past its due
 * date; in progress once anything has started; otherwise not started.
 */
export function roadmapExecution(c: { total: number; completed: number; started: number; late: number }): { status: RoadmapExecutionStatus; pct: number } {
  if (c.total === 0) return { status: "NOT_TRACKED", pct: 0 };
  const pct = Math.round((c.completed / c.total) * 100);
  if (c.completed === c.total) return { status: "COMPLETED", pct };
  if (c.late > 0) return { status: "DELAYED", pct };
  if (c.started > 0 || c.completed > 0) return { status: "IN_PROGRESS", pct };
  return { status: "NOT_STARTED", pct };
}

// Communication plan -----------------------------------------------------------------

export const COMM_EVENT_TYPES = ["TRAINING", "AWARENESS", "POLICY_UPDATE", "PROCEDURE_UPDATE", "STRATEGY_UPDATE", "ROADMAP_UPDATE", "KEY_EVENT", "ANNOUNCEMENT"] as const;
export const COMM_EVENT_STATUSES = ["PLANNED", "DONE", "CANCELLED"] as const;
