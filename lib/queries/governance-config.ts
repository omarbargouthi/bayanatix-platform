import { sql } from "../db";

export type GovernanceRoleLabel = {
  roleCode:    string;
  name:        string;
  description: string | null;
};

// Returns display labels for the 3 governance roles — used by every server page
// that renders the GovernancePanel or a workflow stage reference.
export async function getGovernanceRoleLabels(): Promise<Record<string, GovernanceRoleLabel>> {
  const rows = await sql<{ roleCode: string; name: string; description: string | null }[]>`
    SELECT role_code AS "roleCode", role_name_text AS name, description_text AS description
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
