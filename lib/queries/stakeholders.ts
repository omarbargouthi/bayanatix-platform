import { sql } from "../db";

export type Stakeholder = {
  assignmentId: number;
  userId:       string;
  fullName:     string | null;
  email:        string | null;
  roleCode:     string;
  roleName:     string | null;
  assignedAt:   string;
};

export type UserResult = {
  userId:   string;
  fullName: string | null;
  email:    string;
};

export async function getStakeholders(assetTypeCode: string, assetId: number): Promise<Stakeholder[]> {
  return sql<Stakeholder[]>`
    SELECT
      s.assignment_id          AS "assignmentId",
      s.user_id                AS "userId",
      u.full_name              AS "fullName",
      u.email,
      s.role_code              AS "roleCode",
      r.role_name_text         AS "roleName",
      s.assigned_at_timestamp::text AS "assignedAt"
    FROM bayanat.asset_stakeholders s
    JOIN bayanat.users u ON u.user_id = s.user_id
    JOIN bayanat.stakeholder_roles r ON r.role_code = s.role_code
    WHERE s.asset_type_code = ${assetTypeCode} AND s.asset_id = ${assetId}
    ORDER BY s.role_code, u.full_name
  `;
}

export async function assignStakeholder(
  assetTypeCode: string,
  assetId:       number,
  userId:        string,
  roleCode:      string,
): Promise<number | null> {
  // Enforce single owner — remove existing owner before inserting
  if (roleCode === "OWNER") {
    await sql`
      DELETE FROM bayanat.asset_stakeholders
      WHERE asset_type_code = ${assetTypeCode} AND asset_id = ${assetId} AND role_code = 'OWNER'
    `;
  }
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.asset_stakeholders (asset_type_code, asset_id, user_id, role_code)
    VALUES (${assetTypeCode}, ${assetId}, ${userId}, ${roleCode})
    ON CONFLICT (asset_type_code, asset_id, user_id, role_code) DO NOTHING
    RETURNING assignment_id AS id
  `;
  return rows[0]?.id ?? null;
}

export async function removeStakeholder(assignmentId: number): Promise<void> {
  await sql`DELETE FROM bayanat.asset_stakeholders WHERE assignment_id = ${assignmentId}`;
}

export async function searchUsers(q: string, limit = 15): Promise<UserResult[]> {
  const like = `%${q.toLowerCase()}%`;
  return sql<UserResult[]>`
    SELECT user_id AS "userId", full_name AS "fullName", email
    FROM bayanat.users
    WHERE is_active = true
      AND (
        LOWER(full_name) LIKE ${like}
        OR LOWER(email)  LIKE ${like}
        OR LOWER(user_id) LIKE ${like}
      )
    ORDER BY full_name
    LIMIT ${limit}
  `;
}

// Notify all stewards (BIZ_STEWARD + TECH_STEWARD) of an asset — used by workflow engine
export async function notifyAssetStewards(
  assetTypeCode: string,
  assetId:       number,
  title:         string,
  body:          string,
  actionHref:    string,
): Promise<void> {
  const stewards = await sql<{ userId: string }[]>`
    SELECT user_id AS "userId"
    FROM bayanat.asset_stakeholders
    WHERE asset_type_code = ${assetTypeCode}
      AND asset_id = ${assetId}
      AND role_code IN ('BIZ_STEWARD', 'TECH_STEWARD', 'CUSTODIAN')
  `;
  for (const s of stewards) {
    await sql`
      INSERT INTO bayanat.notifications
        (user_id, type, title, body, severity, action_label, action_href)
      VALUES
        (${s.userId}, 'WORKFLOW', ${title}, ${body}, 'INFO', 'View', ${actionHref})
    `;
  }
}

// Bulk-assign governance defaults to a newly discovered entity (called during crawl)
export async function applyGovernanceDefaults(
  entityId:            number,
  defaultOwnerId:      string | null,
  defaultBizStewardId: string | null,
  defaultTechStewardId: string | null,
  defaultCustodianId:  string | null,
): Promise<void> {
  const assignments: { userId: string; roleCode: string }[] = [
    ...(defaultOwnerId      ? [{ userId: defaultOwnerId,      roleCode: "OWNER" }]       : []),
    ...(defaultBizStewardId ? [{ userId: defaultBizStewardId, roleCode: "BIZ_STEWARD" }] : []),
    ...(defaultTechStewardId? [{ userId: defaultTechStewardId,roleCode: "TECH_STEWARD" }]: []),
    ...(defaultCustodianId  ? [{ userId: defaultCustodianId,  roleCode: "CUSTODIAN" }]   : []),
  ];
  for (const a of assignments) {
    await sql`
      INSERT INTO bayanat.asset_stakeholders (asset_type_code, asset_id, user_id, role_code)
      VALUES ('DATA_ENTITIES', ${entityId}, ${a.userId}, ${a.roleCode})
      ON CONFLICT (asset_type_code, asset_id, user_id, role_code) DO NOTHING
    `;
  }
}
