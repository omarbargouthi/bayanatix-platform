// Which role manages each domain (client- and server-safe). Holders of the manage role
// approve access requests for that domain; an administrator grants the roles themselves
// in User Management. Names match bayanat.roles (db/115, db/153).
export const DOMAIN_MANAGE_ROLE_NAME = {
  GOVERNANCE:   "Data Governance Officer",
  DATA_QUALITY: "Data Quality Officer",
  DATA_PRIVACY: "Data Privacy Officer",
  SHARING:      "Open Data & Access Officer",
  FOI:          "Open Data & Access Officer",
  OPEN_DATA:    "Open Data & Access Officer",
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

/** A role that grants nothing beyond reading (metadata, data or a domain). Anything
 *  that can write/delete metadata, manage a domain, see PI in clear text or administer
 *  the platform is not read-only — and can't be held by a user whose system role is Viewer. */
/** True when the role also carries catalog privileges (metadata / data), which are
 *  scoped to a data source, schema or table — unlike its domain privileges. */
export function hasCatalogPrivileges(r: { metadataRead: boolean; metadataWrite: boolean; metadataDelete: boolean; dataRead: boolean; isAdmin: boolean }): boolean {
  return r.metadataRead || r.metadataWrite || r.metadataDelete || r.dataRead || r.isAdmin;
}

export function isReadOnlyRole(r: { metadataWrite: boolean; metadataDelete: boolean; domainWrite: boolean; isAdmin: boolean; piClearTextAllowed?: boolean }): boolean {
  return !(r.metadataWrite || r.metadataDelete || r.domainWrite || r.isAdmin || r.piClearTextAllowed);
}
