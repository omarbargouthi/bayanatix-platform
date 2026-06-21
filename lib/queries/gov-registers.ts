import { sql } from "../db";

export type GovRegister = {
  registerId:   number;
  name:         string;
  description:  string | null;
  isSystem:     boolean;
  createdAt:    string;
  deletedAt:    string | null;
  deletedBy:    string | null;
  columnCount:  number;
  entryCount:   number;
};

export type RegisterColumn = {
  columnId:   number;
  registerId: number;
  columnName: string;
  columnKey:  string;
  dataType:   string;
  isRequired: boolean;
  options:    string[] | null;
  sortOrder:  number;
};

export type RegisterEntry = {
  entryId:    number;
  registerId: number;
  data:       Record<string, unknown>;
  createdAt:  string;
  updatedAt:  string;
  createdBy:  string | null;
};

export type RegisterEntryHistory = {
  historyId:  number;
  registerId: number;
  entryId:    number;
  action:     string;
  changedBy:  string | null;
  changedAt:  string;
  oldData:    Record<string, unknown> | null;
  newData:    Record<string, unknown> | null;
};

export type RegisterColumnLog = {
  logId:         number;
  registerId:    number;
  columnId:      number | null;
  columnName:    string;
  columnKey:     string;
  action:        string;
  affectedCount: number;
  archivedData:  Record<string, unknown> | null;
  changedBy:     string | null;
  changedAt:     string;
};

export async function listRegisters(): Promise<GovRegister[]> {
  return sql<GovRegister[]>`
    SELECT
      r.register_id   AS "registerId",
      r.name,
      r.description,
      r.is_system     AS "isSystem",
      r.created_at::text AS "createdAt",
      NULL::text      AS "deletedAt",
      NULL::text      AS "deletedBy",
      COUNT(DISTINCT c.column_id)::int AS "columnCount",
      COUNT(DISTINCT e.entry_id)::int  AS "entryCount"
    FROM bayanat.gov_registers r
    LEFT JOIN bayanat.gov_register_columns c ON c.register_id = r.register_id
    LEFT JOIN bayanat.gov_register_entries e ON e.register_id = r.register_id
    WHERE r.deleted_at IS NULL
    GROUP BY r.register_id
    ORDER BY r.is_system DESC, r.name
  `;
}

export async function listDeletedRegisters(): Promise<GovRegister[]> {
  return sql<GovRegister[]>`
    SELECT
      r.register_id   AS "registerId",
      r.name,
      r.description,
      r.is_system     AS "isSystem",
      r.created_at::text AS "createdAt",
      r.deleted_at::text AS "deletedAt",
      r.deleted_by       AS "deletedBy",
      COUNT(DISTINCT c.column_id)::int AS "columnCount",
      COUNT(DISTINCT e.entry_id)::int  AS "entryCount"
    FROM bayanat.gov_registers r
    LEFT JOIN bayanat.gov_register_columns c ON c.register_id = r.register_id
    LEFT JOIN bayanat.gov_register_entries e ON e.register_id = r.register_id
    WHERE r.deleted_at IS NOT NULL
    GROUP BY r.register_id
    ORDER BY r.deleted_at DESC
  `;
}

export async function getRegister(registerId: number, includeDeleted = false): Promise<GovRegister | null> {
  const rows = await sql<GovRegister[]>`
    SELECT r.register_id AS "registerId", r.name, r.description,
           r.is_system AS "isSystem", r.created_at::text AS "createdAt",
           r.deleted_at::text AS "deletedAt", r.deleted_by AS "deletedBy",
           COUNT(DISTINCT c.column_id)::int AS "columnCount",
           COUNT(DISTINCT e.entry_id)::int  AS "entryCount"
    FROM bayanat.gov_registers r
    LEFT JOIN bayanat.gov_register_columns c ON c.register_id = r.register_id
    LEFT JOIN bayanat.gov_register_entries e ON e.register_id = r.register_id
    WHERE r.register_id = ${registerId}
      AND (${includeDeleted} OR r.deleted_at IS NULL)
    GROUP BY r.register_id
  `;
  return rows[0] ?? null;
}

export async function createRegister(name: string, description: string | null): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_registers (name, description) VALUES (${name}, ${description})
    RETURNING register_id AS id
  `;
  return rows[0].id;
}

export async function updateRegister(registerId: number, name: string, description: string | null): Promise<void> {
  await sql`UPDATE bayanat.gov_registers SET name=${name}, description=${description} WHERE register_id=${registerId}`;
}

export async function softDeleteRegister(registerId: number, deletedBy: string): Promise<void> {
  await sql`
    UPDATE bayanat.gov_registers
    SET deleted_at = NOW(), deleted_by = ${deletedBy}
    WHERE register_id = ${registerId} AND is_system = FALSE
  `;
}

export async function restoreRegister(registerId: number): Promise<void> {
  await sql`
    UPDATE bayanat.gov_registers
    SET deleted_at = NULL, deleted_by = NULL
    WHERE register_id = ${registerId}
  `;
}

export async function listColumns(registerId: number): Promise<RegisterColumn[]> {
  return sql<RegisterColumn[]>`
    SELECT column_id AS "columnId", register_id AS "registerId",
           column_name AS "columnName", column_key AS "columnKey",
           data_type AS "dataType", is_required AS "isRequired",
           options, sort_order AS "sortOrder"
    FROM bayanat.gov_register_columns
    WHERE register_id = ${registerId}
    ORDER BY sort_order, column_id
  `;
}

export async function addColumn(registerId: number, col: {
  columnName: string; columnKey: string; dataType: string;
  isRequired: boolean; options: string[] | null; sortOrder: number;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_register_columns
      (register_id, column_name, column_key, data_type, is_required, options, sort_order)
    VALUES (${registerId}, ${col.columnName}, ${col.columnKey}, ${col.dataType},
            ${col.isRequired}, ${col.options ? JSON.stringify(col.options) : null},
            ${col.sortOrder})
    RETURNING column_id AS id
  `;
  return rows[0].id;
}

export async function updateColumn(columnId: number, col: {
  columnName?: string; dataType?: string; isRequired?: boolean;
  options?: string[] | null; sortOrder?: number;
}): Promise<void> {
  await sql`
    UPDATE bayanat.gov_register_columns SET
      column_name = COALESCE(${col.columnName ?? null}, column_name),
      data_type   = COALESCE(${col.dataType ?? null},   data_type),
      is_required = COALESCE(${col.isRequired ?? null}, is_required),
      options     = COALESCE(${col.options !== undefined ? JSON.stringify(col.options) : null}::jsonb, options),
      sort_order  = COALESCE(${col.sortOrder ?? null},  sort_order)
    WHERE column_id = ${columnId}
  `;
}

export async function deleteColumnWithCleanup(
  columnId: number,
  registerId: number,
  columnKey: string,
  columnName: string,
  archiveData: boolean,
  changedBy: string,
): Promise<void> {
  if (archiveData) {
    // Snapshot all entry values for this column into the column log
    const entries = await sql<{ entryId: number; val: unknown }[]>`
      SELECT entry_id AS "entryId", data->>${columnKey} AS val
      FROM bayanat.gov_register_entries
      WHERE register_id = ${registerId} AND data ? ${columnKey}
    `;
    const snapshot: Record<string, unknown> = {};
    for (const e of entries) {
      if (e.val !== null) snapshot[String(e.entryId)] = e.val;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotJson = snapshot as any;
    await sql`
      INSERT INTO bayanat.gov_register_column_log
        (register_id, column_id, column_name, column_key, action, affected_count, archived_data, changed_by)
      VALUES (${registerId}, ${columnId}, ${columnName}, ${columnKey}, 'DELETED',
              ${Object.keys(snapshot).length}, ${snapshotJson}, ${changedBy})
    `;
  }

  // Remove this key from all entry JSONB data
  await sql`
    UPDATE bayanat.gov_register_entries
    SET data = data - ${columnKey}
    WHERE register_id = ${registerId}
  `;

  await sql`DELETE FROM bayanat.gov_register_columns WHERE column_id = ${columnId}`;
}

export async function getColumnLog(registerId: number): Promise<RegisterColumnLog[]> {
  return sql<RegisterColumnLog[]>`
    SELECT
      log_id         AS "logId",
      register_id    AS "registerId",
      column_id      AS "columnId",
      column_name    AS "columnName",
      column_key     AS "columnKey",
      action,
      affected_count AS "affectedCount",
      archived_data  AS "archivedData",
      changed_by     AS "changedBy",
      changed_at::text AS "changedAt"
    FROM bayanat.gov_register_column_log
    WHERE register_id = ${registerId}
    ORDER BY changed_at DESC
  `;
}

export async function listEntries(registerId: number): Promise<RegisterEntry[]> {
  return sql<RegisterEntry[]>`
    SELECT entry_id AS "entryId", register_id AS "registerId",
           data, created_at::text AS "createdAt", updated_at::text AS "updatedAt",
           created_by AS "createdBy"
    FROM bayanat.gov_register_entries
    WHERE register_id = ${registerId}
    ORDER BY created_at DESC
  `;
}

export async function createEntry(registerId: number, data: Record<string, unknown>, createdBy: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonData = data as any;
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_register_entries (register_id, data, created_by)
    VALUES (${registerId}, ${jsonData}, ${createdBy})
    RETURNING entry_id AS id
  `;
  const id = rows[0].id;
  await sql`
    INSERT INTO bayanat.gov_register_entry_history (register_id, entry_id, action, changed_by, new_data)
    VALUES (${registerId}, ${id}, 'CREATE', ${createdBy}, ${jsonData})
  `;
  return id;
}

export async function updateEntry(entryId: number, data: Record<string, unknown>, changedBy?: string): Promise<void> {
  const [old] = await sql<{ data: unknown; registerId: number }[]>`
    SELECT data, register_id AS "registerId" FROM bayanat.gov_register_entries WHERE entry_id = ${entryId}
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonData = data as any;
  await sql`UPDATE bayanat.gov_register_entries SET data=${jsonData}, updated_at=NOW() WHERE entry_id=${entryId}`;
  if (old) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldJson = (typeof old.data === "string" ? JSON.parse(old.data) : old.data) as any;
    await sql`
      INSERT INTO bayanat.gov_register_entry_history (register_id, entry_id, action, changed_by, old_data, new_data)
      VALUES (${old.registerId}, ${entryId}, 'UPDATE', ${changedBy ?? null}, ${oldJson}, ${jsonData})
    `;
  }
}

export async function deleteEntry(entryId: number, changedBy?: string): Promise<void> {
  const [old] = await sql<{ data: unknown; registerId: number }[]>`
    SELECT data, register_id AS "registerId" FROM bayanat.gov_register_entries WHERE entry_id = ${entryId}
  `;
  await sql`DELETE FROM bayanat.gov_register_entries WHERE entry_id=${entryId}`;
  if (old) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldJson = (typeof old.data === "string" ? JSON.parse(old.data) : old.data) as any;
    await sql`
      INSERT INTO bayanat.gov_register_entry_history (register_id, entry_id, action, changed_by, old_data)
      VALUES (${old.registerId}, ${entryId}, 'DELETE', ${changedBy ?? null}, ${oldJson})
    `;
  }
}

export async function getRegisterHistory(registerId: number): Promise<RegisterEntryHistory[]> {
  return sql<RegisterEntryHistory[]>`
    SELECT
      h.history_id  AS "historyId",
      h.register_id AS "registerId",
      h.entry_id    AS "entryId",
      h.action,
      h.changed_by  AS "changedBy",
      h.changed_at::text AS "changedAt",
      h.old_data    AS "oldData",
      h.new_data    AS "newData"
    FROM bayanat.gov_register_entry_history h
    WHERE h.register_id = ${registerId}
    ORDER BY h.changed_at DESC
    LIMIT 200
  `;
}
