// Which role manages each domain (client- and server-safe). Holders of the manage role
// approve access requests for that domain; an administrator grants the roles themselves
// in User Management. Names match bayanat.roles (db/115, db/150).
export const DOMAIN_MANAGE_ROLE_NAME = {
  GOVERNANCE:   "Data Governance Compliance",
  DATA_QUALITY: "Data Quality",
  DATA_PRIVACY: "Data Privacy Manager",
  SHARING:      "Open Data & Access",
  FOI:          "Open Data & Access",
  OPEN_DATA:    "Open Data & Access",
} as const;

/** Display names for the domains (also stored as role_assignments.resource_name). */
export const DOMAIN_LABEL: Record<string, string> = {
  GOVERNANCE:   "Data Governance",
  DATA_QUALITY: "Data Quality",
  DATA_PRIVACY: "Data Privacy",
  SHARING:      "Data Sharing",
  FOI:          "FOI Requests",
  OPEN_DATA:    "Open Data",
};
