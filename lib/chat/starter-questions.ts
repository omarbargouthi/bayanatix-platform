export type PageKind = "HOME" | "ASSET" | "REPORTS" | "OTHER";

export function pageKindForPath(pathname: string): PageKind {
  if (pathname.startsWith("/catalog") || pathname.startsWith("/assets")) return "ASSET";
  if (pathname.startsWith("/reports")) return "REPORTS";
  if (pathname === "/dashboard" || pathname === "/homepage") return "HOME";
  return "OTHER";
}

// Static per-page-type config for v1 — not admin-manageable (spec FR-1.4 asks for
// "configurable" starter questions, deferred to a fast-follow admin UI).
export const STARTER_QUESTIONS: Record<PageKind, string[]> = {
  HOME: [
    "What percentage of our data is classified?",
    "How many data quality issues are open right now?",
    "Which sharing agreements expire soon?",
  ],
  ASSET: [
    "Does this table have any data quality issues?",
    "What columns does this table have?",
    "Is this table classified?",
  ],
  REPORTS: [
    "Summarize our data quality status",
    "How much of the finance schema is classified?",
    "How many FOI requests are overdue?",
  ],
  OTHER: [
    "Do we have anything about customer data?",
    "What does 'active customer' mean here?",
    "How many FOI requests are overdue?",
  ],
};
