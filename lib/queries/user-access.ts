// What a user holds on the platform, for My Profile: the roles assigned to them (directly
// or through a team), the teams they belong to, and the source systems, schemas and
// tables they have a governance role on.
import { sql } from "../db";

export type UserRoleAssignment = {
  roleName: string; description: string | null;
  /** GLOBAL, DATA_SOURCE, SCHEMA, TABLE or DOMAIN. */
  resourceType: string; resourceName: string | null;
  /** Set when the role comes from a team rather than a direct assignment. */
  viaTeam: string | null;
};
export type UserTeam = { teamId: number; teamName: string; description: string | null; memberCount: number };
export type GovernedAsset = {
  level: "SOURCE" | "SCHEMA" | "TABLE";
  schemaId: number | null; entityId: number | null;
  /** Schema name, or schema.table; null for the source itself. */
  name: string | null;
  roles: string[];
};
export type GovernedSource = { sourceId: number; sourceName: string; typeCode: string | null; assets: GovernedAsset[] };
export type UserAccessProfile = { roles: UserRoleAssignment[]; teams: UserTeam[]; governed: GovernedSource[] };

export async function getUserAccessProfile(userId: string): Promise<UserAccessProfile> {
  const [roles, teams, rows] = await Promise.all([
    sql<UserRoleAssignment[]>`
      SELECT r.role_name AS "roleName", r.description, ra.resource_type AS "resourceType",
             ra.resource_name AS "resourceName", t.team_name AS "viaTeam"
      FROM   bayanat.role_assignments ra
      JOIN   bayanat.roles r ON r.role_id = ra.role_id
      LEFT   JOIN bayanat.teams t ON t.team_id = ra.team_id
      WHERE  ra.user_id = ${userId}
         OR  ra.team_id IN (SELECT team_id FROM bayanat.team_members WHERE user_id = ${userId})
      ORDER  BY r.role_name, (ra.resource_type <> 'GLOBAL'), ra.resource_type, ra.resource_name
    `,
    sql<UserTeam[]>`
      SELECT t.team_id AS "teamId", t.team_name AS "teamName", t.description,
             (SELECT count(*) FROM bayanat.team_members m WHERE m.team_id = t.team_id)::int AS "memberCount"
      FROM   bayanat.team_members tm
      JOIN   bayanat.teams t ON t.team_id = tm.team_id
      WHERE  tm.user_id = ${userId}
      ORDER  BY t.team_name
    `,
    sql<{ sourceId: number; sourceName: string; typeCode: string | null; level: GovernedAsset["level"];
          schemaId: number | null; entityId: number | null; name: string | null; roles: string[] }[]>`
      SELECT ds.data_source_id AS "sourceId", ds.source_name_text AS "sourceName", ds.source_type_code AS "typeCode",
             a.level, a.schema_id AS "schemaId", a.entity_id AS "entityId", a.name,
             array_agg(DISTINCT coalesce(sr.role_name_text, a.role_code) ORDER BY coalesce(sr.role_name_text, a.role_code)) AS roles
      FROM (
        SELECT st.asset_id AS source_id, 'SOURCE' AS level, NULL::int AS schema_id, NULL::int AS entity_id, NULL::text AS name, st.role_code
        FROM   bayanat.asset_stakeholders st
        WHERE  st.user_id = ${userId} AND st.asset_type_code = 'DATA_SOURCES'
        UNION ALL
        SELECT s.data_source_id, 'SCHEMA', s.schema_id, NULL, s.schema_name_text, st.role_code
        FROM   bayanat.asset_stakeholders st
        JOIN   bayanat.data_schemas s ON s.schema_id = st.asset_id
        WHERE  st.user_id = ${userId} AND st.asset_type_code = 'DATA_SCHEMAS'
        UNION ALL
        SELECT s.data_source_id, 'TABLE', s.schema_id, e.entity_id, s.schema_name_text || '.' || e.entity_name_text, st.role_code
        FROM   bayanat.asset_stakeholders st
        JOIN   bayanat.data_entities e ON e.entity_id = st.asset_id
        JOIN   bayanat.data_schemas  s ON s.schema_id = e.schema_id
        WHERE  st.user_id = ${userId} AND st.asset_type_code = 'DATA_ENTITIES'
      ) a
      JOIN   bayanat.data_sources ds ON ds.data_source_id = a.source_id
      LEFT   JOIN bayanat.stakeholder_roles sr ON sr.role_code = a.role_code
      GROUP  BY ds.data_source_id, ds.source_name_text, ds.source_type_code, a.level, a.schema_id, a.entity_id, a.name
      ORDER  BY ds.source_name_text, (a.level = 'SOURCE') DESC, (a.level = 'SCHEMA') DESC, a.name
    `,
  ]);

  const governed: GovernedSource[] = [];
  for (const r of rows) {
    let g = governed[governed.length - 1];
    if (!g || g.sourceId !== Number(r.sourceId)) {
      g = { sourceId: Number(r.sourceId), sourceName: r.sourceName, typeCode: r.typeCode, assets: [] };
      governed.push(g);
    }
    g.assets.push({ level: r.level, schemaId: r.schemaId, entityId: r.entityId, name: r.name, roles: r.roles });
  }
  return { roles: [...roles], teams: [...teams], governed };
}
