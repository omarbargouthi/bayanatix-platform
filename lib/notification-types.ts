// Canonical taxonomy of bayanat.notifications.type values — shared by the
// Profile page's notification-preferences UI and the API route that saves
// which ones a user has opted out of (users.disabled_notification_types).
export const NOTIFICATION_TYPES = [
  { code: "WORKFLOW",       label: "Workflow & Approvals", description: "Requests, approvals, and workflow stages assigned to you" },
  { code: "COLLABORATION",  label: "Collaboration",        description: "Discussion and question threads on assets you're involved with" },
  { code: "COMPLIANCE",     label: "Compliance",           description: "Compliance assessment and review updates" },
  { code: "REVIEW",         label: "Reviews",              description: "Asset or policy reviews awaiting your input" },
  { code: "CLASSIFICATION", label: "Classification",       description: "Automated classification results on your assets" },
  { code: "QUALITY",        label: "Data Quality",         description: "Data quality rule failures on your assets" },
  { code: "CERTIFICATION",  label: "Certification",        description: "Certification status changes on your assets" },
] as const;

export type NotificationTypeCode = (typeof NOTIFICATION_TYPES)[number]["code"];
export const NOTIFICATION_TYPE_CODES: readonly string[] = NOTIFICATION_TYPES.map((n) => n.code);
