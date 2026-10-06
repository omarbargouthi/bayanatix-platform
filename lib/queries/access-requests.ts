import { sql } from "../db";
import type { SessionUser } from "../types";
import { canManageDomain, isDataSourceOwner, resolveSourceIdForCatalogResource } from "../can";
import type { DomainCode } from "../can";
import { getStakeholders } from "./stakeholders";

export const CATALOG_RESOURCE_TYPES = ["DATA_SOURCE", "SCHEMA", "TABLE"] as const;
export type CatalogResourceType = typeof CATALOG_RESOURCE_TYPES[number];

export type AccessRequestRow = {
  requestId:         number;
  requesterUserId:   string;
  requesterName:     string | null;
  requestKind:       "DOMAIN" | "CATALOG";
  domainCode:        DomainCode | null;
  resourceType:      CatalogResourceType | null;
  resourceId:        string | null;
  resourceName:      string | null;
  justificationText: string | null;
  statusCode:        "PENDING" | "APPROVED" | "REJECTED";
  decidedByUserId:   string | null;
  decidedAt:         string | null;
  decisionNoteText:  string | null;
  createdAt:         string;
};

export async function getAccessRequestById(requestId: number): Promise<AccessRequestRow | null> {
  const rows = await sql<AccessRequestRow[]>`
    SELECT
      ar.request_id          AS "requestId",
      ar.requester_user_id   AS "requesterUserId",
      u.full_name            AS "requesterName",
      ar.request_kind        AS "requestKind",
      ar.domain_code         AS "domainCode",
      ar.resource_type       AS "resourceType",
      ar.resource_id         AS "resourceId",
      ar.resource_name       AS "resourceName",
      ar.justification_text  AS "justificationText",
      ar.status_code         AS "statusCode",
      ar.decided_by_user_id  AS "decidedByUserId",
      ar.decided_at::text    AS "decidedAt",
      ar.decision_note_text  AS "decisionNoteText",
      ar.created_at::text    AS "createdAt"
    FROM bayanat.access_requests ar
    JOIN bayanat.users u ON u.user_id = ar.requester_user_id
    WHERE ar.request_id = ${requestId}
  `;
  return rows[0] ?? null;
}

export async function listAccessRequests(): Promise<AccessRequestRow[]> {
  return sql<AccessRequestRow[]>`
    SELECT
      ar.request_id          AS "requestId",
      ar.requester_user_id   AS "requesterUserId",
      u.full_name            AS "requesterName",
      ar.request_kind        AS "requestKind",
      ar.domain_code         AS "domainCode",
      ar.resource_type       AS "resourceType",
      ar.resource_id         AS "resourceId",
      ar.resource_name       AS "resourceName",
      ar.justification_text  AS "justificationText",
      ar.status_code         AS "statusCode",
      ar.decided_by_user_id  AS "decidedByUserId",
      ar.decided_at::text    AS "decidedAt",
      ar.decision_note_text  AS "decisionNoteText",
      ar.created_at::text    AS "createdAt"
    FROM bayanat.access_requests ar
    JOIN bayanat.users u ON u.user_id = ar.requester_user_id
    ORDER BY ar.created_at DESC
  `;
}

// Who should be told about a new request: for a domain, the holders of that domain's
// manage role (directly or through a team); for a catalog resource, the OWNER of its
// data source. Falls back to the administrators when nobody holds that role yet.
export async function approversFor(row: Pick<AccessRequestRow, "requestKind" | "domainCode" | "resourceType" | "resourceId">): Promise<string[]> {
  let ids: string[] = [];
  if (row.requestKind === "DOMAIN" && row.domainCode) {
    ids = (await sql<{ userId: string }[]>`
      SELECT DISTINCT coalesce(ra.user_id, tm.user_id) AS "userId"
      FROM bayanat.role_assignments ra
      JOIN bayanat.roles r ON r.role_id = ra.role_id AND r.domain_write
      LEFT JOIN bayanat.team_members tm ON tm.team_id = ra.team_id
      WHERE ra.resource_type = 'DOMAIN' AND ra.resource_id = ${row.domainCode}
        AND coalesce(ra.user_id, tm.user_id) IS NOT NULL
    `).map((r) => r.userId);
  } else if (row.resourceType && row.resourceId != null) {
    const sourceId = await resolveSourceIdForCatalogResource(row.resourceType, Number(row.resourceId));
    if (sourceId != null) ids = (await getStakeholders("DATA_SOURCES", sourceId)).filter((s) => s.roleCode === "OWNER").map((s) => s.userId);
  }
  const active = ids.length === 0 ? [] : (await sql<{ userId: string }[]>`SELECT user_id AS "userId" FROM bayanat.users WHERE user_id = ANY(${ids}) AND is_active`).map((r) => r.userId);
  if (active.length > 0) return active;
  return (await sql<{ userId: string }[]>`SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'ADMIN' AND is_active`).map((r) => r.userId);
}

// Whether `session` is the authorized approver for this request: ADMIN always;
// for DOMAIN-kind, whoever manages that domain; for CATALOG-kind, always the
// OWNER stakeholder of the resource's data source (resolved up from schema/table).
export async function canApproveAccessRequest(session: SessionUser, row: AccessRequestRow): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  if (row.requestKind === "DOMAIN") {
    return row.domainCode != null && canManageDomain(session, row.domainCode);
  }
  if (!row.resourceType || row.resourceId == null) return false;
  const sourceId = await resolveSourceIdForCatalogResource(row.resourceType, Number(row.resourceId));
  if (sourceId == null) return false;
  return isDataSourceOwner(session, sourceId);
}
