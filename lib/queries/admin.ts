import { sql } from "../db";
import type { AdminUser, Role, Team, RoleAssignment, TeamMember } from "../types";

// ── Users ──────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<AdminUser[]> {
  return sql<AdminUser[]>`
    SELECT
      u.user_id      AS "userId",
      u.email,
      u.full_name    AS "fullName",
      u.role         AS "systemRole",
      u.is_active    AS "isActive",
      u.created_at   AS "createdAt",
      (SELECT COUNT(*)::int FROM bayanat.team_members tm WHERE tm.user_id = u.user_id) AS "teamCount"
    FROM bayanat.users u
    ORDER BY u.full_name
  `;
}

export async function getUserById(userId: string): Promise<AdminUser | null> {
  const rows = await sql<AdminUser[]>`
    SELECT
      u.user_id      AS "userId",
      u.email,
      u.full_name    AS "fullName",
      u.role         AS "systemRole",
      u.is_active    AS "isActive",
      u.created_at   AS "createdAt",
      (SELECT COUNT(*)::int FROM bayanat.team_members tm WHERE tm.user_id = u.user_id) AS "teamCount"
    FROM bayanat.users u
    WHERE u.user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function createUser(
  userId: string,
  email: string,
  fullName: string,
  systemRole: string,
  passwordHash: string,
): Promise<void> {
  await sql`
    INSERT INTO bayanat.users (user_id, email, full_name, role, password_hash)
    VALUES (${userId}, ${email}, ${fullName}, ${systemRole}, ${passwordHash})
  `;
}

export async function updateUser(
  userId: string,
  patch: { fullName?: string; email?: string; systemRole?: string; isActive?: boolean },
): Promise<void> {
  const { fullName, email, systemRole, isActive } = patch;
  await sql`
    UPDATE bayanat.users SET
      full_name  = COALESCE(${fullName ?? null}, full_name),
      email      = COALESCE(${email ?? null}, email),
      role       = COALESCE(${systemRole ?? null}, role),
      is_active  = COALESCE(${isActive ?? null}, is_active)
    WHERE user_id = ${userId}
  `;
}

export async function updateUserPassword(userId: string, hash: string): Promise<void> {
  await sql`UPDATE bayanat.users SET password_hash = ${hash} WHERE user_id = ${userId}`;
}

// ── Roles ──────────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<Role[]> {
  return sql<Role[]>`
    SELECT
      r.role_id         AS "roleId",
      r.role_name       AS "roleName",
      r.description,
      r.metadata_read   AS "metadataRead",
      r.metadata_write  AS "metadataWrite",
      r.metadata_delete AS "metadataDelete",
      r.data_read       AS "dataRead",
      r.is_admin        AS "isAdmin",
      r.created_at      AS "createdAt",
      (SELECT COUNT(DISTINCT user_id)::int FROM bayanat.role_assignments ra
         WHERE ra.role_id = r.role_id AND ra.user_id IS NOT NULL) AS "userCount",
      (SELECT COUNT(DISTINCT team_id)::int FROM bayanat.role_assignments ra
         WHERE ra.role_id = r.role_id AND ra.team_id IS NOT NULL) AS "teamCount"
    FROM bayanat.roles r
    ORDER BY r.is_admin DESC, r.role_name
  `;
}

export async function getRoleById(roleId: number): Promise<Role | null> {
  const rows = await sql<Role[]>`
    SELECT
      r.role_id         AS "roleId",
      r.role_name       AS "roleName",
      r.description,
      r.metadata_read   AS "metadataRead",
      r.metadata_write  AS "metadataWrite",
      r.metadata_delete AS "metadataDelete",
      r.data_read       AS "dataRead",
      r.is_admin        AS "isAdmin",
      r.created_at      AS "createdAt",
      (SELECT COUNT(DISTINCT user_id)::int FROM bayanat.role_assignments ra
         WHERE ra.role_id = r.role_id AND ra.user_id IS NOT NULL) AS "userCount",
      (SELECT COUNT(DISTINCT team_id)::int FROM bayanat.role_assignments ra
         WHERE ra.role_id = r.role_id AND ra.team_id IS NOT NULL) AS "teamCount"
    FROM bayanat.roles r WHERE r.role_id = ${roleId}
  `;
  return rows[0] ?? null;
}

export async function createRole(data: {
  roleName: string; description: string;
  metadataRead: boolean; metadataWrite: boolean; metadataDelete: boolean;
  dataRead: boolean; isAdmin: boolean;
}): Promise<number> {
  const rows = await sql<{ roleId: number }[]>`
    INSERT INTO bayanat.roles
      (role_name, description, metadata_read, metadata_write, metadata_delete, data_read, is_admin)
    VALUES
      (${data.roleName}, ${data.description}, ${data.metadataRead},
       ${data.metadataWrite}, ${data.metadataDelete}, ${data.dataRead}, ${data.isAdmin})
    RETURNING role_id AS "roleId"
  `;
  return rows[0].roleId;
}

export async function updateRole(roleId: number, data: {
  roleName?: string; description?: string;
  metadataRead?: boolean; metadataWrite?: boolean; metadataDelete?: boolean;
  dataRead?: boolean; isAdmin?: boolean;
}): Promise<void> {
  await sql`
    UPDATE bayanat.roles SET
      role_name        = COALESCE(${data.roleName ?? null},        role_name),
      description      = COALESCE(${data.description ?? null},     description),
      metadata_read    = COALESCE(${data.metadataRead ?? null},    metadata_read),
      metadata_write   = COALESCE(${data.metadataWrite ?? null},   metadata_write),
      metadata_delete  = COALESCE(${data.metadataDelete ?? null},  metadata_delete),
      data_read        = COALESCE(${data.dataRead ?? null},        data_read),
      is_admin         = COALESCE(${data.isAdmin ?? null},         is_admin)
    WHERE role_id = ${roleId}
  `;
}

export async function deleteRole(roleId: number): Promise<void> {
  await sql`DELETE FROM bayanat.roles WHERE role_id = ${roleId}`;
}

// ── Teams ──────────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<Team[]> {
  return sql<Team[]>`
    SELECT
      t.team_id     AS "teamId",
      t.team_name   AS "teamName",
      t.description,
      t.created_at  AS "createdAt",
      (SELECT COUNT(*)::int FROM bayanat.team_members tm WHERE tm.team_id = t.team_id) AS "memberCount",
      (SELECT COUNT(*)::int FROM bayanat.role_assignments ra WHERE ra.team_id = t.team_id) AS "roleCount"
    FROM bayanat.teams t
    ORDER BY t.team_name
  `;
}

export async function getTeamById(teamId: number): Promise<Team | null> {
  const rows = await sql<Team[]>`
    SELECT
      t.team_id     AS "teamId",
      t.team_name   AS "teamName",
      t.description,
      t.created_at  AS "createdAt",
      (SELECT COUNT(*)::int FROM bayanat.team_members tm WHERE tm.team_id = t.team_id) AS "memberCount",
      (SELECT COUNT(*)::int FROM bayanat.role_assignments ra WHERE ra.team_id = t.team_id) AS "roleCount"
    FROM bayanat.teams t WHERE t.team_id = ${teamId}
  `;
  return rows[0] ?? null;
}

export async function getTeamMembers(teamId: number): Promise<TeamMember[]> {
  return sql<TeamMember[]>`
    SELECT
      u.user_id    AS "userId",
      u.full_name  AS "fullName",
      u.email,
      u.role       AS "systemRole",
      tm.joined_at AS "joinedAt"
    FROM bayanat.team_members tm
    JOIN bayanat.users u ON u.user_id = tm.user_id
    WHERE tm.team_id = ${teamId}
    ORDER BY u.full_name
  `;
}

export async function createTeam(teamName: string, description: string): Promise<number> {
  const rows = await sql<{ teamId: number }[]>`
    INSERT INTO bayanat.teams (team_name, description)
    VALUES (${teamName}, ${description})
    RETURNING team_id AS "teamId"
  `;
  return rows[0].teamId;
}

export async function updateTeam(teamId: number, patch: { teamName?: string; description?: string }): Promise<void> {
  await sql`
    UPDATE bayanat.teams SET
      team_name   = COALESCE(${patch.teamName ?? null},   team_name),
      description = COALESCE(${patch.description ?? null}, description)
    WHERE team_id = ${teamId}
  `;
}

export async function deleteTeam(teamId: number): Promise<void> {
  await sql`DELETE FROM bayanat.teams WHERE team_id = ${teamId}`;
}

export async function addTeamMember(teamId: number, userId: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.team_members (team_id, user_id)
    VALUES (${teamId}, ${userId})
    ON CONFLICT DO NOTHING
  `;
}

export async function removeTeamMember(teamId: number, userId: string): Promise<void> {
  await sql`DELETE FROM bayanat.team_members WHERE team_id=${teamId} AND user_id=${userId}`;
}

// ── Role assignments ───────────────────────────────────────────────────────────

export async function getAssignmentsForUser(userId: string): Promise<RoleAssignment[]> {
  return sql<RoleAssignment[]>`
    SELECT
      ra.assignment_id  AS "assignmentId",
      ra.role_id        AS "roleId",
      r.role_name       AS "roleName",
      r.metadata_read   AS "metadataRead",
      r.metadata_write  AS "metadataWrite",
      r.metadata_delete AS "metadataDelete",
      r.data_read       AS "dataRead",
      r.is_admin        AS "isAdmin",
      ra.user_id        AS "userId",
      u.full_name       AS "userFullName",
      ra.team_id        AS "teamId",
      NULL              AS "teamName",
      ra.resource_type  AS "resourceType",
      ra.resource_id    AS "resourceId",
      ra.resource_name  AS "resourceName",
      ra.created_at     AS "createdAt"
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    LEFT JOIN bayanat.users u ON u.user_id = ra.user_id
    WHERE ra.user_id = ${userId}
    ORDER BY ra.created_at DESC
  `;
}

export async function getAssignmentsForTeam(teamId: number): Promise<RoleAssignment[]> {
  return sql<RoleAssignment[]>`
    SELECT
      ra.assignment_id  AS "assignmentId",
      ra.role_id        AS "roleId",
      r.role_name       AS "roleName",
      r.metadata_read   AS "metadataRead",
      r.metadata_write  AS "metadataWrite",
      r.metadata_delete AS "metadataDelete",
      r.data_read       AS "dataRead",
      r.is_admin        AS "isAdmin",
      ra.user_id        AS "userId",
      NULL              AS "userFullName",
      ra.team_id        AS "teamId",
      t.team_name       AS "teamName",
      ra.resource_type  AS "resourceType",
      ra.resource_id    AS "resourceId",
      ra.resource_name  AS "resourceName",
      ra.created_at     AS "createdAt"
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    LEFT JOIN bayanat.teams t ON t.team_id = ra.team_id
    WHERE ra.team_id = ${teamId}
    ORDER BY ra.created_at DESC
  `;
}

export async function getAssignmentsForRole(roleId: number): Promise<RoleAssignment[]> {
  return sql<RoleAssignment[]>`
    SELECT
      ra.assignment_id  AS "assignmentId",
      ra.role_id        AS "roleId",
      r.role_name       AS "roleName",
      r.metadata_read   AS "metadataRead",
      r.metadata_write  AS "metadataWrite",
      r.metadata_delete AS "metadataDelete",
      r.data_read       AS "dataRead",
      r.is_admin        AS "isAdmin",
      ra.user_id        AS "userId",
      u.full_name       AS "userFullName",
      ra.team_id        AS "teamId",
      t.team_name       AS "teamName",
      ra.resource_type  AS "resourceType",
      ra.resource_id    AS "resourceId",
      ra.resource_name  AS "resourceName",
      ra.created_at     AS "createdAt"
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    LEFT JOIN bayanat.users u ON u.user_id = ra.user_id
    LEFT JOIN bayanat.teams t ON t.team_id = ra.team_id
    WHERE ra.role_id = ${roleId}
    ORDER BY ra.created_at DESC
  `;
}

export async function createAssignment(data: {
  roleId: number;
  userId?: string;
  teamId?: number;
  resourceType: string;
  resourceId: string | null;
  resourceName: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.role_assignments
      (role_id, user_id, team_id, resource_type, resource_id, resource_name)
    VALUES
      (${data.roleId},
       ${data.userId ?? null},
       ${data.teamId ?? null},
       ${data.resourceType},
       ${data.resourceId ?? null},
       ${data.resourceName})
    RETURNING assignment_id AS id
  `;
  return rows[0].id;
}

export async function deleteAssignment(assignmentId: number): Promise<void> {
  await sql`DELETE FROM bayanat.role_assignments WHERE assignment_id = ${assignmentId}`;
}
