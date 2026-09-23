// Auto-provisions a local bayanat.users row the first time someone authenticates
// via an external provider (LDAP or OIDC) and assigns them the configured
// read-only "Viewer" access — see db/111_auth_providers.sql for the schema this
// relies on, and lib/can.ts for how data_read role_assignments are enforced.

import { sql } from "./db";
import { getResolvedAuthConfig } from "./queries/auth-settings";
import type { SessionUser } from "./types";

function slugifyUserId(email: string): string {
  const local = email.split("@")[0] || email;
  return local.toLowerCase().replace(/[^a-z0-9._-]/g, ".").slice(0, 55);
}

async function uniqueUserId(base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  // Small collision space in practice (per-customer user directories), a linear
  // probe is fine — this only runs once per brand-new external user.
  while (true) {
    const [row] = await sql<{ exists: boolean }[]>`SELECT true AS exists FROM bayanat.users WHERE user_id = ${candidate}`;
    if (!row) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

async function grantExternalViewerAccess(userId: string, roleId: number, sourceIds: number[] | null): Promise<void> {
  const scopes = !sourceIds || sourceIds.length === 0
    ? [{ resourceType: "GLOBAL", resourceId: null as string | null, resourceName: "All data sources" }]
    : await resolveSourceNames(sourceIds);

  for (const scope of scopes) {
    const [already] = await sql<{ id: number }[]>`
      SELECT assignment_id AS id FROM bayanat.role_assignments
      WHERE role_id = ${roleId} AND user_id = ${userId}
        AND resource_type = ${scope.resourceType} AND resource_id IS NOT DISTINCT FROM ${scope.resourceId}
    `;
    if (already) continue;
    await sql`
      INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_id, resource_name)
      VALUES (${roleId}, ${userId}, ${scope.resourceType}, ${scope.resourceId}, ${scope.resourceName})
    `;
  }
}

async function resolveSourceNames(sourceIds: number[]): Promise<Array<{ resourceType: string; resourceId: string; resourceName: string }>> {
  const rows = await sql<{ id: number; name: string }[]>`
    SELECT data_source_id AS id, source_name_text AS name FROM bayanat.data_sources WHERE data_source_id = ANY(${sourceIds})
  `;
  return rows.map((r) => ({ resourceType: "DATA_SOURCE", resourceId: String(r.id), resourceName: r.name }));
}

export type ExternalIdentity = {
  email: string;
  fullName: string;
  subject: string; // LDAP DN or OIDC `sub`
  provider: "LDAP" | "OIDC";
};

/**
 * Finds the local user for an already-verified external identity, creating one
 * (with the configured auto-provision role) on first sign-in. Never touches
 * password_hash — external accounts have none.
 */
export async function findOrCreateExternalUser(identity: ExternalIdentity): Promise<SessionUser> {
  const existingBySubject = await sql<Array<{
    userId: string; email: string; fullName: string; role: SessionUser["role"];
    preferredLanguageCode: string | null; avatarColorCode: string | null; isActive: boolean;
  }>>`
    SELECT user_id AS "userId", email, full_name AS "fullName", role,
           preferred_language_code AS "preferredLanguageCode", avatar_color_code AS "avatarColorCode",
           is_active AS "isActive"
    FROM bayanat.users WHERE external_subject_text = ${identity.subject} AND auth_provider_code = ${identity.provider}
  `;
  const existingByEmail = existingBySubject[0] ? [] : await sql<typeof existingBySubject>`
    SELECT user_id AS "userId", email, full_name AS "fullName", role,
           preferred_language_code AS "preferredLanguageCode", avatar_color_code AS "avatarColorCode",
           is_active AS "isActive"
    FROM bayanat.users WHERE lower(email) = lower(${identity.email})
  `;
  const existing = existingBySubject[0] ?? existingByEmail[0];

  if (existing) {
    if (!existing.isActive) throw new Error("This account has been deactivated. Contact your administrator.");
    // Keep the directory's current name and subject linkage fresh on every login.
    await sql`
      UPDATE bayanat.users SET full_name = ${identity.fullName}, external_subject_text = ${identity.subject},
        auth_provider_code = ${identity.provider}, last_login_at = NOW()
      WHERE user_id = ${existing.userId}
    `;
    return {
      userId: existing.userId, email: existing.email, fullName: identity.fullName, role: existing.role,
      preferredLanguageCode: existing.preferredLanguageCode, avatarColorCode: existing.avatarColorCode,
    };
  }

  const authConfig = await getResolvedAuthConfig();
  const userId = await uniqueUserId(slugifyUserId(identity.email));

  await sql`
    INSERT INTO bayanat.users (user_id, email, full_name, role, password_hash, auth_provider_code, external_subject_text, last_login_at)
    VALUES (${userId}, ${identity.email}, ${identity.fullName}, 'VIEWER', NULL, ${identity.provider}, ${identity.subject}, NOW())
  `;

  if (authConfig.autoProvisionRoleId) {
    await grantExternalViewerAccess(userId, authConfig.autoProvisionRoleId, authConfig.autoProvisionSourceIds);
  }

  return {
    userId, email: identity.email, fullName: identity.fullName, role: "VIEWER",
    preferredLanguageCode: null, avatarColorCode: null,
  };
}
