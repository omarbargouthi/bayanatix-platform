import { sql } from "./db";
import type { AuditEntry } from "./types";

export async function logUpdate(
  assetType: string,
  assetId: number,
  userId: string,
  // `force` records the entry even when oldVal === newVal — needed for actions like
  // "Accept suggestion" where nothing about the stored value changes but the action
  // itself (a steward reviewing and confirming it) is still what needs to show up
  // in the history log.
  changes: Array<{ field: string; oldVal: string | null; newVal: string | null; force?: boolean }>,
): Promise<void> {
  const diff = changes.filter((c) => c.force || c.oldVal !== c.newVal);
  if (diff.length === 0) return;

  try {
    const rows = await sql<{ audit_id: number }[]>`
      INSERT INTO bayanat.audit_logs (action_type_code, asset_type_code, asset_id, user_id)
      VALUES ('UPDATE', ${assetType}, ${assetId}, ${userId})
      RETURNING audit_id
    `;
    const auditId = rows[0].audit_id;
    for (const c of diff) {
      await sql`
        INSERT INTO bayanat.history_logs (audit_id, field_name_text, old_value_text, new_value_text)
        VALUES (${auditId}, ${c.field}, ${c.oldVal}, ${c.newVal})
      `;
    }
  } catch (err) {
    console.warn("[audit] logUpdate failed:", err);
  }
}

export type AuditSearchEntry = AuditEntry & {
  assetType: string;
  assetId:   number;
};

export async function searchAuditLog(params: {
  assetType?: string;
  userId?:    string;
  from?:      string;
  to?:        string;
  q?:         string;
  page?:      number;
  limit?:     number;
}): Promise<{ entries: AuditSearchEntry[]; total: number }> {
  const { assetType, userId, from, to, q, page = 1, limit = 50 } = params;
  const offset = (page - 1) * limit;

  const rows = await sql<{
    audit_id:         number;
    action_type_code: string;
    asset_type_code:  string;
    asset_id:         number;
    user_id:          string;
    full_name:        string | null;
    action_timestamp: string;
    field_name_text:  string | null;
    old_value_text:   string | null;
    new_value_text:   string | null;
  }[]>`
    SELECT
      a.audit_id,
      a.action_type_code,
      a.asset_type_code,
      a.asset_id,
      a.user_id,
      u.full_name,
      a.action_timestamp,
      h.field_name_text,
      h.old_value_text,
      h.new_value_text
    FROM bayanat.audit_logs a
    LEFT JOIN bayanat.users u ON u.user_id = a.user_id
    LEFT JOIN bayanat.history_logs h ON h.audit_id = a.audit_id
    WHERE 1 = 1
      ${assetType ? sql`AND a.asset_type_code = ${assetType}` : sql``}
      ${userId    ? sql`AND a.user_id = ${userId}`            : sql``}
      ${from      ? sql`AND a.action_timestamp >= ${from}`    : sql``}
      ${to        ? sql`AND a.action_timestamp <= ${to}`      : sql``}
      ${q ? sql`AND (
        h.field_name_text ILIKE ${'%' + q + '%'}
        OR h.old_value_text ILIKE ${'%' + q + '%'}
        OR h.new_value_text ILIKE ${'%' + q + '%'}
      )` : sql``}
    ORDER BY a.action_timestamp DESC, a.audit_id DESC, h.history_id
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql<{ cnt: number }[]>`
    SELECT COUNT(DISTINCT a.audit_id)::int AS cnt
    FROM bayanat.audit_logs a
    LEFT JOIN bayanat.history_logs h ON h.audit_id = a.audit_id
    WHERE 1 = 1
      ${assetType ? sql`AND a.asset_type_code = ${assetType}` : sql``}
      ${userId    ? sql`AND a.user_id = ${userId}`            : sql``}
      ${from      ? sql`AND a.action_timestamp >= ${from}`    : sql``}
      ${to        ? sql`AND a.action_timestamp <= ${to}`      : sql``}
      ${q ? sql`AND (
        h.field_name_text ILIKE ${'%' + q + '%'}
        OR h.old_value_text ILIKE ${'%' + q + '%'}
        OR h.new_value_text ILIKE ${'%' + q + '%'}
      )` : sql``}
  `;

  const map = new Map<number, AuditSearchEntry>();
  for (const r of rows) {
    if (!map.has(r.audit_id)) {
      map.set(r.audit_id, {
        auditId:   r.audit_id,
        action:    r.action_type_code,
        assetType: r.asset_type_code,
        assetId:   r.asset_id,
        userId:    r.user_id,
        userName:  r.full_name,
        timestamp: String(r.action_timestamp),
        changes:   [],
      });
    }
    if (r.field_name_text) {
      map.get(r.audit_id)!.changes.push({
        field: r.field_name_text,
        from:  r.old_value_text,
        to:    r.new_value_text,
      });
    }
  }

  return {
    entries: [...map.values()],
    total:   countRows[0]?.cnt ?? 0,
  };
}

export async function getHistory(
  assetType: string,
  assetId: number,
): Promise<AuditEntry[]> {
  const rows = await sql<{
    audit_id:         number;
    action_type_code: string;
    user_id:          string;
    full_name:        string | null;
    action_timestamp: string;
    field_name_text:  string | null;
    old_value_text:   string | null;
    new_value_text:   string | null;
  }[]>`
    SELECT
      a.audit_id,
      a.action_type_code,
      a.user_id,
      u.full_name,
      a.action_timestamp,
      h.field_name_text,
      h.old_value_text,
      h.new_value_text
    FROM bayanat.audit_logs a
    LEFT JOIN bayanat.users u ON u.user_id = a.user_id
    LEFT JOIN bayanat.history_logs h ON h.audit_id = a.audit_id
    WHERE a.asset_type_code = ${assetType}
      AND a.asset_id = ${assetId}
    ORDER BY a.action_timestamp DESC, a.audit_id DESC, h.history_id
  `;

  // Group rows by audit_id
  const map = new Map<number, AuditEntry>();
  for (const r of rows) {
    if (!map.has(r.audit_id)) {
      map.set(r.audit_id, {
        auditId:   r.audit_id,
        action:    r.action_type_code,
        userId:    r.user_id,
        userName:  r.full_name,
        timestamp: String(r.action_timestamp),
        changes:   [],
      });
    }
    if (r.field_name_text) {
      map.get(r.audit_id)!.changes.push({
        field: r.field_name_text,
        from:  r.old_value_text,
        to:    r.new_value_text,
      });
    }
  }
  return [...map.values()];
}
