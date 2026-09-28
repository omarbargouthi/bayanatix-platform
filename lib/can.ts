import { sql } from "./db";
import type { SessionUser } from "./types";
import { resolveEffectiveGovernance, resolveEffectiveEntityGovernance } from "./queries/stakeholders";

// Resolves an entity down to its schema/data-source ids, for resource-scoped
// role_assignments checks (GLOBAL / DATA_SOURCE / SCHEMA / TABLE all apply).
async function resolveEntityScope(entityId: number): Promise<{ schemaId: number | null; dataSourceId: number | null }> {
  const [row] = await sql<{ schemaId: number | null; dataSourceId: number | null }[]>`
    SELECT s.schema_id AS "schemaId", s.data_source_id AS "dataSourceId"
    FROM bayanat.data_entities e LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE e.entity_id = ${entityId}
  `;
  return { schemaId: row?.schemaId ?? null, dataSourceId: row?.dataSourceId ?? null };
}

export async function canEditMetadata(session: SessionUser): Promise<boolean> {
  if (session.role === "ADMIN" || session.role === "STEWARD") return true;

  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.metadata_write = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (
          SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId}
        )
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}

/**
 * Row-level edit permission for a specific asset (Bulk Download/Upload spec §3.1 /
 * AC8) — canEditMetadata() above is intentionally left as a global-only check since
 * every existing call site relies on that; this is a separate, additive function
 * that also honors DATA_SOURCE/SCHEMA/TABLE-scoped role_assignments (data model and
 * admin UI already existed to create these, they just weren't enforced anywhere).
 * A column's permission resolves through its owning table.
 */
export async function canEditAsset(
  session: SessionUser,
  assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES" | "DATA_SOURCES",
  assetId: number,
): Promise<boolean> {
  if (session.role === "ADMIN" || session.role === "STEWARD") return true;

  let entityId: number | null = assetType === "DATA_ENTITIES" ? assetId : null;
  let schemaId: number | null = null;
  let dataSourceId: number | null = assetType === "DATA_SOURCES" ? assetId : null;

  if (assetType === "DATA_ATTRIBUTES") {
    const [row] = await sql<{ entityId: number }[]>`
      SELECT entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ${assetId}
    `;
    entityId = row?.entityId ?? null;
  }
  if (entityId != null) {
    const [row] = await sql<{ schemaId: number | null; dataSourceId: number | null }[]>`
      SELECT s.schema_id AS "schemaId", s.data_source_id AS "dataSourceId"
      FROM bayanat.data_entities e LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_id = ${entityId}
    `;
    schemaId = row?.schemaId ?? null;
    dataSourceId = row?.dataSourceId ?? dataSourceId;
  }

  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.metadata_write = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId})
      )
      AND (
        ra.resource_type = 'GLOBAL'
        OR (ra.resource_type = 'TABLE' AND ra.resource_id = ${entityId != null ? String(entityId) : null})
        OR (ra.resource_type = 'SCHEMA' AND ra.resource_id = ${schemaId != null ? String(schemaId) : null})
        OR (ra.resource_type = 'DATA_SOURCE' AND ra.resource_id = ${dataSourceId != null ? String(dataSourceId) : null})
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}

// Gate for the entire FOI (Freedom of Information) case-management module —
// the OFFICER system role exists in the SessionUser type specifically for
// this. Being OFFICER is necessary but, since the FOI domain was locked down
// (see canAccessDomain), no longer sufficient on its own: an OFFICER also
// needs an "Open Data & Access" domain grant covering FOI (ADMIN still
// bypasses both, via getDomainAccess). Async because of that domain check —
// every call site awaits this now.
export async function isFoiStaff(session: SessionUser): Promise<boolean> {
  if (session.role !== "ADMIN" && session.role !== "OFFICER") return false;
  return canAccessDomain(session, "FOI");
}

// Whether `session` may preview a table's row data at all (Sample Data tab
// gate). Unlike canEditMetadata/canEditAsset, STEWARD does NOT auto-pass here —
// "Data Read" is deliberately a separate, explicitly-granted privilege (see the
// 'Data Steward' role seed: metadata_read/write TRUE, data_read FALSE). Only
// the ADMIN system role bypasses; everyone else needs a data_read-granting
// role_assignment covering this table, its schema, its data source, or GLOBAL.
export async function canReadData(session: SessionUser, entityId: number): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  const { schemaId, dataSourceId } = await resolveEntityScope(entityId);
  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.data_read = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId})
      )
      AND (
        ra.resource_type = 'GLOBAL'
        OR (ra.resource_type = 'TABLE' AND ra.resource_id = ${String(entityId)})
        OR (ra.resource_type = 'SCHEMA' AND ra.resource_id = ${schemaId != null ? String(schemaId) : null})
        OR (ra.resource_type = 'DATA_SOURCE' AND ra.resource_id = ${dataSourceId != null ? String(dataSourceId) : null})
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}

// Role-level eligibility to even REQUEST PI clear-text viewing — the "special
// configuration under the role assignment" the feature is gated on. Being
// eligible does not itself unmask anything; it only unlocks the request button
// (see hasPiClearTextGrant for the actual, workflow-approved grant).
export async function roleAllowsPiClearText(session: SessionUser, entityId: number): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  const { schemaId, dataSourceId } = await resolveEntityScope(entityId);
  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.pii_clear_text_allowed = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId})
      )
      AND (
        ra.resource_type = 'GLOBAL'
        OR (ra.resource_type = 'TABLE' AND ra.resource_id = ${String(entityId)})
        OR (ra.resource_type = 'SCHEMA' AND ra.resource_id = ${schemaId != null ? String(schemaId) : null})
        OR (ra.resource_type = 'DATA_SOURCE' AND ra.resource_id = ${dataSourceId != null ? String(dataSourceId) : null})
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}

// Whether the DPO -> DMO Manager workflow has actually approved this specific
// user for clear-text viewing on this specific table.
export async function hasPiClearTextGrant(userId: string, entityId: number): Promise<boolean> {
  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt FROM bayanat.pi_access_grants
    WHERE user_id = ${userId} AND asset_type_code = 'DATA_ENTITIES' AND asset_id = ${entityId}
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}

// Full clear-text decision for one column value: eligible role AND an
// approved grant (or platform ADMIN, who bypasses both).
export async function canViewPiClearText(session: SessionUser, entityId: number): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  const [eligible, granted] = await Promise.all([
    roleAllowsPiClearText(session, entityId),
    hasPiClearTextGrant(session.userId, entityId),
  ]);
  return eligible && granted;
}

// ── Domain-level access (Governance / Data Quality / Data Privacy / Data
// Sharing / FOI / Open Data) ────────────────────────────────────────────────
// A separate dimension from the asset-scoped checks above: whether the user
// may see/manage an entire feature domain at all, independent of any
// particular table/schema/source. Reuses the same bayanat.roles /
// role_assignments tables via a new resource_type='DOMAIN', resource_id one
// of the DomainCode values below (see db/115_domain_access.sql).
export type DomainCode = "GOVERNANCE" | "DATA_QUALITY" | "DATA_PRIVACY" | "SHARING" | "FOI" | "OPEN_DATA";

export async function getDomainAccess(session: SessionUser, domain: DomainCode): Promise<"WRITE" | "READ" | "NONE"> {
  if (session.role === "ADMIN") return "WRITE";
  const [row] = await sql<{ write: boolean; read: boolean }[]>`
    SELECT bool_or(r.domain_write) AS write, bool_or(r.domain_read) AS read
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE ra.resource_type = 'DOMAIN' AND ra.resource_id = ${domain}
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId})
      )
  `;
  if (row?.write) return "WRITE";
  if (row?.read) return "READ";
  return "NONE";
}

export async function canAccessDomain(session: SessionUser, domain: DomainCode): Promise<boolean> {
  return (await getDomainAccess(session, domain)) !== "NONE";
}

export async function canManageDomain(session: SessionUser, domain: DomainCode): Promise<boolean> {
  return (await getDomainAccess(session, domain)) === "WRITE";
}

// DQ-rule creation: the Data Quality domain role, OR being an effective
// Owner/Business Steward/Technical Steward of the specific asset (walks
// column -> table -> schema -> source via the existing governance resolvers —
// no new stewardship concept needed).
const DQ_STEWARD_CODES = new Set(["OWNER", "BIZ_STEWARD", "TECH_STEWARD"]);

export async function canCreateDqRule(
  session: SessionUser,
  assetTypeCode: string,
  assetId: number,
): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  if (await canManageDomain(session, "DATA_QUALITY")) return true;

  const effective = assetTypeCode === "DATA_ENTITIES"
    ? await resolveEffectiveEntityGovernance(assetId)
    : assetTypeCode === "DATA_ATTRIBUTES"
    ? await resolveEffectiveGovernance(assetId)
    : [];
  return effective.some((e) => e.userId === session.userId && DQ_STEWARD_CODES.has(e.roleCode));
}
