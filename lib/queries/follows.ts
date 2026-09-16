import { sql } from "../db";

export async function isFollowing(userId: string, assetTypeCode: string, assetId: number): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    SELECT 1 AS n FROM bayanat.asset_follows
    WHERE user_id = ${userId} AND asset_type_code = ${assetTypeCode} AND asset_id = ${assetId}
  `;
  return rows.length > 0;
}

export async function followAsset(userId: string, assetTypeCode: string, assetId: number): Promise<void> {
  await sql`
    INSERT INTO bayanat.asset_follows (user_id, asset_type_code, asset_id)
    VALUES (${userId}, ${assetTypeCode}, ${assetId})
    ON CONFLICT (user_id, asset_type_code, asset_id) DO NOTHING
  `;
}

export async function unfollowAsset(userId: string, assetTypeCode: string, assetId: number): Promise<void> {
  await sql`
    DELETE FROM bayanat.asset_follows
    WHERE user_id = ${userId} AND asset_type_code = ${assetTypeCode} AND asset_id = ${assetId}
  `;
}

export type FollowSettings = { schemaFollowEnabled: boolean; sourceFollowEnabled: boolean };

export async function getFollowSettings(): Promise<FollowSettings> {
  const [row] = await sql<FollowSettings[]>`
    SELECT schema_follow_enabled AS "schemaFollowEnabled", source_follow_enabled AS "sourceFollowEnabled"
    FROM bayanat.follow_settings WHERE settings_id = 1
  `;
  return row ?? { schemaFollowEnabled: false, sourceFollowEnabled: false };
}

export async function updateFollowSettings(data: Partial<FollowSettings>): Promise<void> {
  await sql`
    UPDATE bayanat.follow_settings SET
      schema_follow_enabled = COALESCE(${data.schemaFollowEnabled ?? null}, schema_follow_enabled),
      source_follow_enabled = COALESCE(${data.sourceFollowEnabled ?? null}, source_follow_enabled)
    WHERE settings_id = 1
  `;
}

export type FollowedActivityItem = {
  auditId:      number;
  action:       string;
  assetType:    string;
  assetId:      number;
  assetName:    string | null;
  actorUserId:  string;
  actorName:    string | null;
  timestamp:    string;
  href:         string | null;
  followedType: string;
  followedId:   number;
  followedName: string | null;
};

// Activity feed for a user's Homepage — every audit_logs row on an asset the
// user follows OR on any "underlying" asset beneath it (a followed table's
// columns; a followed schema's tables and columns; a followed source's
// schemas, tables and columns), matching the same asset hierarchy
// GovernancePanel's inheritance already walks (db/046, db/097). Reuses
// bayanat.audit_logs as the sole activity source (see lib/audit.ts) rather
// than a parallel event log.
export async function getFollowedActivity(userId: string, limit = 30): Promise<FollowedActivityItem[]> {
  const rows = await sql<FollowedActivityItem[]>`
    SELECT
      a.audit_id           AS "auditId",
      a.action_type_code   AS "action",
      a.asset_type_code    AS "assetType",
      a.asset_id           AS "assetId",
      CASE a.asset_type_code
        WHEN 'DATA_SOURCES'    THEN ds.source_name_text
        WHEN 'DATA_SCHEMAS'    THEN sc.schema_name_text
        WHEN 'DATA_ENTITIES'   THEN e.entity_name_text
        WHEN 'DATA_ATTRIBUTES' THEN attr.physical_name_text
      END                  AS "assetName",
      a.user_id            AS "actorUserId",
      u.full_name          AS "actorName",
      a.action_timestamp::text AS "timestamp",
      CASE a.asset_type_code
        WHEN 'DATA_SCHEMAS'    THEN '/catalog/' || sc.schema_id
        WHEN 'DATA_ENTITIES'   THEN '/catalog/' || e.schema_id || '/tables/' || e.entity_id
        WHEN 'DATA_ATTRIBUTES' THEN '/catalog/' || e2.schema_id || '/tables/' || e2.entity_id
        WHEN 'DATA_SOURCES'    THEN '/catalog'
      END                  AS "href",
      f.asset_type_code    AS "followedType",
      f.asset_id           AS "followedId",
      CASE f.asset_type_code
        WHEN 'DATA_SOURCES'  THEN fds.source_name_text
        WHEN 'DATA_SCHEMAS'  THEN fsc.schema_name_text
        WHEN 'DATA_ENTITIES' THEN fe.entity_name_text
      END                  AS "followedName"
    FROM bayanat.audit_logs a
    LEFT JOIN bayanat.users u ON u.user_id = a.user_id
    LEFT JOIN bayanat.data_sources    ds   ON a.asset_type_code = 'DATA_SOURCES'    AND ds.data_source_id = a.asset_id
    LEFT JOIN bayanat.data_schemas    sc   ON a.asset_type_code = 'DATA_SCHEMAS'    AND sc.schema_id      = a.asset_id
    LEFT JOIN bayanat.data_entities   e    ON a.asset_type_code = 'DATA_ENTITIES'   AND e.entity_id       = a.asset_id
    LEFT JOIN bayanat.data_attributes attr ON a.asset_type_code = 'DATA_ATTRIBUTES' AND attr.attribute_id = a.asset_id
    LEFT JOIN bayanat.data_entities   e2   ON a.asset_type_code = 'DATA_ATTRIBUTES' AND e2.entity_id      = attr.entity_id
    LEFT JOIN bayanat.data_schemas    sc_e  ON a.asset_type_code = 'DATA_ENTITIES'   AND sc_e.schema_id  = e.schema_id
    LEFT JOIN bayanat.data_schemas    sc_e2 ON a.asset_type_code = 'DATA_ATTRIBUTES' AND sc_e2.schema_id = e2.schema_id
    JOIN LATERAL (
      SELECT f.asset_type_code, f.asset_id
      FROM bayanat.asset_follows f
      WHERE f.user_id = ${userId}
        AND (
          (f.asset_type_code = a.asset_type_code AND f.asset_id = a.asset_id)
          OR (f.asset_type_code = 'DATA_ENTITIES' AND a.asset_type_code = 'DATA_ATTRIBUTES' AND f.asset_id = attr.entity_id)
          OR (f.asset_type_code = 'DATA_SCHEMAS'  AND a.asset_type_code = 'DATA_ENTITIES'   AND f.asset_id = e.schema_id)
          OR (f.asset_type_code = 'DATA_SCHEMAS'  AND a.asset_type_code = 'DATA_ATTRIBUTES' AND f.asset_id = e2.schema_id)
          OR (f.asset_type_code = 'DATA_SOURCES'  AND a.asset_type_code = 'DATA_SCHEMAS'    AND f.asset_id = sc.data_source_id)
          OR (f.asset_type_code = 'DATA_SOURCES'  AND a.asset_type_code = 'DATA_ENTITIES'   AND f.asset_id = sc_e.data_source_id)
          OR (f.asset_type_code = 'DATA_SOURCES'  AND a.asset_type_code = 'DATA_ATTRIBUTES' AND f.asset_id = sc_e2.data_source_id)
        )
      LIMIT 1
    ) f ON true
    LEFT JOIN bayanat.data_sources  fds ON f.asset_type_code = 'DATA_SOURCES'  AND fds.data_source_id = f.asset_id
    LEFT JOIN bayanat.data_schemas  fsc ON f.asset_type_code = 'DATA_SCHEMAS'  AND fsc.schema_id      = f.asset_id
    LEFT JOIN bayanat.data_entities fe  ON f.asset_type_code = 'DATA_ENTITIES' AND fe.entity_id       = f.asset_id
    ORDER BY a.action_timestamp DESC, a.audit_id DESC
    LIMIT ${limit}
  `;
  return rows;
}

export async function getFollowedAssets(userId: string): Promise<{ assetTypeCode: string; assetId: number; assetName: string | null; followedAt: string }[]> {
  return sql<{ assetTypeCode: string; assetId: number; assetName: string | null; followedAt: string }[]>`
    SELECT
      f.asset_type_code AS "assetTypeCode",
      f.asset_id        AS "assetId",
      CASE f.asset_type_code
        WHEN 'DATA_SOURCES'  THEN ds.source_name_text
        WHEN 'DATA_SCHEMAS'  THEN sc.schema_name_text
        WHEN 'DATA_ENTITIES' THEN e.entity_name_text
      END AS "assetName",
      f.followed_at::text AS "followedAt"
    FROM bayanat.asset_follows f
    LEFT JOIN bayanat.data_sources  ds ON f.asset_type_code = 'DATA_SOURCES'  AND ds.data_source_id = f.asset_id
    LEFT JOIN bayanat.data_schemas  sc ON f.asset_type_code = 'DATA_SCHEMAS'  AND sc.schema_id      = f.asset_id
    LEFT JOIN bayanat.data_entities e  ON f.asset_type_code = 'DATA_ENTITIES' AND e.entity_id       = f.asset_id
    WHERE f.user_id = ${userId}
    ORDER BY f.followed_at DESC
  `;
}
