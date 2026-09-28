import { sql } from "../db";
import type { SessionUser } from "../types";
import { canManageDomain, isDataSourceOwner, resolveSourceIdForCatalogResource } from "../can";
import type { DomainCode } from "../can";

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
