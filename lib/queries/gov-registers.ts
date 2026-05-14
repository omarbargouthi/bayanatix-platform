import { sql } from "../db";

export type GovRegister = {
  registerId:   number;
  name:         string;
  description:  string | null;
  isSystem:     boolean;
  createdAt:    string;
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

export async function listRegisters(): Promise<GovRegister[]> {
  return sql<GovRegister[]>`
    SELECT
      r.register_id   AS "registerId",
      r.name,
      r.description,
      r.is_system     AS "isSystem",
      r.created_at::text AS "createdAt",
      COUNT(DISTINCT c.column_id)::int AS "columnCount",
      COUNT(DISTINCT e.entry_id)::int  AS "entryCount"
    FROM bayanat.gov_registers r
    LEFT JOIN bayanat.gov_register_columns c ON c.register_id = r.register_id
    LEFT JOIN bayanat.gov_register_entries e ON e.register_id = r.register_id
    GROUP BY r.register_id
    ORDER BY r.is_system DESC, r.name
  `;
}

export async function getRegister(registerId: number): Promise<GovRegister | null> {
  const rows = await sql<GovRegister[]>`
    SELECT r.register_id AS "registerId", r.name, r.description,
           r.is_system AS "isSystem", r.created_at::text AS "createdAt",
           COUNT(DISTINCT c.column_id)::int AS "columnCount",
           COUNT(DISTINCT e.entry_id)::int  AS "entryCount"
    FROM bayanat.gov_registers r
    LEFT JOIN bayanat.gov_register_columns c ON c.register_id = r.register_id
    LEFT JOIN bayanat.gov_register_entries e ON e.register_id = r.register_id
    WHERE r.register_id = ${registerId}
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

export async function deleteRegister(registerId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_registers WHERE register_id=${registerId} AND is_system=FALSE`;
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

export async function deleteColumn(columnId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_register_columns WHERE column_id = ${columnId}`;
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
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_register_entries (register_id, data, created_by)
    VALUES (${registerId}, ${JSON.stringify(data)}, ${createdBy})
    RETURNING entry_id AS id
  `;
  return rows[0].id;
}

export async function updateEntry(entryId: number, data: Record<string, unknown>): Promise<void> {
  await sql`UPDATE bayanat.gov_register_entries SET data=${JSON.stringify(data)}, updated_at=NOW() WHERE entry_id=${entryId}`;
}

export async function deleteEntry(entryId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_register_entries WHERE entry_id=${entryId}`;
}
