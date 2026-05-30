import { sql } from "../db";

// ── Type ──────────────────────────────────────────────────────────────────────

export type AppLookup = {
  lookupId:    number;
  lookupGroup: string;
  lookupCode:  string;
  lookupLabel: string;
  labelAr:     string | null;
  description: string | null;
  sortOrder:   number;
  isActive:    boolean;
  isSystem:    boolean;
  createdAt:   string;
};

// ── Column fragment ───────────────────────────────────────────────────────────

const LOOKUP_COLS = sql.unsafe(`
  lookup_id                     AS "lookupId",
  lookup_group                  AS "lookupGroup",
  lookup_code                   AS "lookupCode",
  lookup_label                  AS "lookupLabel",
  label_ar                      AS "labelAr",
  description                   AS "description",
  coalesce(sort_order, 0)       AS "sortOrder",
  coalesce(is_active,  true)    AS "isActive",
  coalesce(is_system,  false)   AS "isSystem",
  created_at::text              AS "createdAt"
`);

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * List all lookups, ordered by group then sort_order then label.
 * Optionally restricted to a single lookup_group.
 */
export async function listLookups(group?: string): Promise<AppLookup[]> {
  if (group !== undefined) {
    return sql<AppLookup[]>`
      SELECT ${LOOKUP_COLS}
      FROM   bayanat.app_lookups
      WHERE  lookup_group = ${group}
      ORDER  BY lookup_group, sort_order, lookup_label
    `;
  }
  return sql<AppLookup[]>`
    SELECT ${LOOKUP_COLS}
    FROM   bayanat.app_lookups
    ORDER  BY lookup_group, sort_order, lookup_label
  `;
}

/**
 * Return distinct lookup groups with the count of codes in each.
 */
export async function listLookupGroups(): Promise<{ group: string; count: number }[]> {
  return sql<{ group: string; count: number }[]>`
    SELECT
      lookup_group AS "group",
      COUNT(*)::int AS "count"
    FROM  bayanat.app_lookups
    GROUP BY lookup_group
    ORDER BY lookup_group
  `;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Insert a new lookup row and return its lookup_id.
 */
export async function createLookup(data: {
  lookupGroup:  string;
  lookupCode:   string;
  lookupLabel:  string;
  description?: string | null;
  sortOrder?:   number | null;
  isActive?:    boolean | null;
}): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.app_lookups
      (lookup_group, lookup_code, lookup_label, description, sort_order, is_active)
    VALUES (
      ${data.lookupGroup},
      ${data.lookupCode},
      ${data.lookupLabel},
      ${data.description   ?? null},
      ${data.sortOrder     ?? 0},
      ${data.isActive      ?? true}
    )
    RETURNING lookup_id AS id
  `;
  return row.id;
}

/**
 * Full update of a lookup row (all fields required).
 */
export async function updateLookup(
  lookupId: number,
  data: {
    lookupLabel: string;
    labelAr?:    string | null;
    description: string | null;
    sortOrder:   number;
    isActive:    boolean;
  },
): Promise<void> {
  await sql`
    UPDATE bayanat.app_lookups
    SET
      lookup_label = ${data.lookupLabel},
      label_ar     = ${data.labelAr ?? null},
      description  = ${data.description ?? null},
      sort_order   = ${data.sortOrder},
      is_active    = ${data.isActive}
    WHERE lookup_id = ${lookupId}
  `;
}

/**
 * Delete a lookup.
 * Returns {ok: false, reason} when the row is a system lookup.
 * Returns {ok: true} on successful deletion.
 */
export async function deleteLookup(
  lookupId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await sql<{ isSystem: boolean }[]>`
    SELECT coalesce(is_system, false) AS "isSystem"
    FROM   bayanat.app_lookups
    WHERE  lookup_id = ${lookupId}
  `;

  if (!row) {
    // Row not found — treat as already gone, which is fine.
    return { ok: true };
  }

  if (row.isSystem) {
    return { ok: false, reason: "System lookups cannot be deleted" };
  }

  await sql`DELETE FROM bayanat.app_lookups WHERE lookup_id = ${lookupId}`;
  return { ok: true };
}
