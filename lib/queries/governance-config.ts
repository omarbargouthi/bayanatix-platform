import { sql } from "../db";
import { translatedColumnSql } from "../i18n-admin/translated-column";

export type GovernanceRoleLabel = {
  roleCode:    string;
  name:        string;
  description: string | null;
  nameTranslations: Record<string, string> | null;
};

// Returns display labels for the 3 governance roles — used by every server page
// that renders the GovernancePanel or a workflow stage reference. GovernancePanel
// itself checks the GOVERNANCE_ROLE app_lookups group first (already
// translation-linked) and only falls back to this when no matching lookup
// exists — nameTranslations covers that fallback path too.
export async function getGovernanceRoleLabels(): Promise<Record<string, GovernanceRoleLabel>> {
  const rows = await sql<{ roleCode: string; name: string; description: string | null; nameTranslations: Record<string, string> | null }[]>`
    SELECT role_code AS "roleCode", role_name_text AS name, description_text AS description,
           ${sql.unsafe(translatedColumnSql(`'list.stakeholder_roles.' || role_code`, "nameTranslations"))}
    FROM bayanat.stakeholder_roles
    WHERE role_code IN ('OWNER', 'BIZ_STEWARD', 'TECH_STEWARD')
    ORDER BY CASE role_code WHEN 'OWNER' THEN 1 WHEN 'BIZ_STEWARD' THEN 2 ELSE 3 END
  `;
  const out: Record<string, GovernanceRoleLabel> = {};
  for (const r of rows) out[r.roleCode] = r;
  return out;
}

export async function updateGovernanceRoleLabel(
  roleCode: string,
  name: string,
  description: string | null,
): Promise<void> {
  await sql`
    UPDATE bayanat.stakeholder_roles
    SET role_name_text = ${name}, description_text = ${description ?? null}
    WHERE role_code = ${roleCode}
  `;
}
