import { sql } from "./db";
import type { SessionUser } from "./types";

export async function canEditMetadata(session: SessionUser): Promise<boolean> {
  if (session.role === "ADMIN" || session.role === "STEWARD") return true;

  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.role_assignments ra
    JOIN bayanat.roles r ON r.role_id = ra.role_id
    WHERE r.metadata_write = true
      AND (
        ra.user_id = ${session.userId}
        OR ra.team_id IN (
          SELECT team_id FROM bayanat.team_members WHERE user_id = ${session.userId}
        )
      )
  `;
  return (rows[0]?.cnt ?? 0) > 0;
}
