// Named manual processes (db/148): steward-defined groupings for manual lineage
// links, stored as lineage_processes rows of type MANUAL (no connection).
import { sql } from "../db";

export type ManualProcess = {
  processId: number; name: string; description: string | null;
  linkCount: number; pendingCount: number; createdBy: string | null; createdAt: string | null;
};

export async function listManualProcesses(): Promise<ManualProcess[]> {
  return sql<ManualProcess[]>`
    SELECT p.process_id AS "processId", p.process_name AS name, p.description_text AS description,
           (SELECT count(*)::int FROM bayanat.data_lineage dl WHERE dl.process_id = p.process_id) AS "linkCount",
           (SELECT count(*)::int FROM bayanat.lineage_changes c WHERE c.process_id = p.process_id AND c.status_code = 'PENDING') AS "pendingCount",
           u.full_name AS "createdBy", p.created_at::text AS "createdAt"
    FROM bayanat.lineage_processes p
    LEFT JOIN bayanat.users u ON u.user_id = p.created_by_user_id
    WHERE p.process_type_code = 'MANUAL'
    ORDER BY lower(p.process_name)
  `;
}

export async function isManualProcess(processId: number): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM bayanat.lineage_processes WHERE process_id = ${processId} AND process_type_code = 'MANUAL'`;
  return !!row;
}

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

export async function createManualProcess(name: string, description: string | null, userId: string): Promise<{ processId: number } | { error: string }> {
  const n = clean(name);
  if (!n) return { error: "Give the process a name" };
  if (n.length > 200) return { error: "Process name is too long (200 characters max)" };
  const [dup] = await sql`SELECT 1 FROM bayanat.lineage_processes WHERE process_type_code = 'MANUAL' AND lower(process_name) = ${n.toLowerCase()}`;
  if (dup) return { error: `A process named "${n}" already exists` };
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.lineage_processes (connection_id, process_type_code, schema_name, process_name, description_text, created_by_user_id)
    VALUES (NULL, 'MANUAL', NULL, ${n}, ${description?.trim() || null}, ${userId})
    RETURNING process_id AS id
  `;
  return { processId: Number(row.id) };
}

/** Excel import: the named process, created on first use. */
export async function findOrCreateManualProcess(name: string, userId: string): Promise<number | { error: string }> {
  const n = clean(name);
  const [row] = await sql<{ id: number }[]>`SELECT process_id AS id FROM bayanat.lineage_processes WHERE process_type_code = 'MANUAL' AND lower(process_name) = ${n.toLowerCase()}`;
  if (row) return Number(row.id);
  // A scanned process (procedure, SSIS package…) shown in an export isn't a manual one.
  const [scanned] = await sql`SELECT 1 FROM bayanat.lineage_processes WHERE process_type_code <> 'MANUAL' AND lower(process_name) = ${n.toLowerCase()} LIMIT 1`;
  if (scanned) return { error: `"${n}" is a scanned process — scanned links can't be imported; leave Process empty or use a new name` };
  const created = await createManualProcess(n, null, userId);
  return "error" in created ? created : created.processId;
}

export async function updateManualProcess(processId: number, patch: { name?: string; description?: string | null }): Promise<{ ok: true } | { error: string }> {
  if (!(await isManualProcess(processId))) return { error: "Process not found" };
  if (patch.name !== undefined) {
    const n = clean(patch.name);
    if (!n) return { error: "Give the process a name" };
    const [dup] = await sql`SELECT 1 FROM bayanat.lineage_processes WHERE process_type_code = 'MANUAL' AND lower(process_name) = ${n.toLowerCase()} AND process_id <> ${processId}`;
    if (dup) return { error: `A process named "${n}" already exists` };
    await sql`UPDATE bayanat.lineage_processes SET process_name = ${n} WHERE process_id = ${processId}`;
  }
  if (patch.description !== undefined) {
    await sql`UPDATE bayanat.lineage_processes SET description_text = ${patch.description?.trim() || null} WHERE process_id = ${processId}`;
  }
  return { ok: true };
}

/** Only an unused process can be deleted — links keep their process otherwise. */
export async function deleteManualProcess(processId: number): Promise<{ ok: true } | { error: string }> {
  const [p] = await sql<{ links: number; pending: number }[]>`
    SELECT (SELECT count(*)::int FROM bayanat.data_lineage WHERE process_id = ${processId}) AS links,
           (SELECT count(*)::int FROM bayanat.lineage_changes WHERE process_id = ${processId} AND status_code = 'PENDING') AS pending
    FROM bayanat.lineage_processes WHERE process_id = ${processId} AND process_type_code = 'MANUAL'
  `;
  if (!p) return { error: "Process not found" };
  if (p.links > 0 || p.pending > 0) return { error: "This process still has lineage links — move or remove them first" };
  await sql`DELETE FROM bayanat.lineage_processes WHERE process_id = ${processId}`;
  return { ok: true };
}
