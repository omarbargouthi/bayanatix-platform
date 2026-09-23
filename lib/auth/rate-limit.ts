// Basic login throttling — DB-backed (bayanat.login_attempts) rather than
// in-memory so it survives a dev-server restart and works the same whether this
// process is the only one or (later) load-balanced across a few. Keyed by email,
// not IP: this app sits behind whatever reverse proxy a customer puts in front of
// it, and getting the real client IP right there is infra-specific — email is a
// stable, always-available bucket for "did this account just get hammered."

import { sql } from "../db";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 10;

export async function isLoginRateLimited(identifier: string): Promise<boolean> {
  const [row] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt FROM bayanat.login_attempts
    WHERE identifier_text = ${identifier.toLowerCase()}
      AND succeeded = false
      AND attempted_at > NOW() - (${WINDOW_MINUTES} || ' minutes')::interval
  `;
  return (row?.cnt ?? 0) >= MAX_FAILURES;
}

export async function recordLoginAttempt(identifier: string, succeeded: boolean): Promise<void> {
  await sql`
    INSERT INTO bayanat.login_attempts (identifier_text, succeeded) VALUES (${identifier.toLowerCase()}, ${succeeded})
  `;
  // Successful login clears the account's own failure count — no reason to keep
  // throttling someone who just proved they own the account.
  if (succeeded) {
    await sql`DELETE FROM bayanat.login_attempts WHERE identifier_text = ${identifier.toLowerCase()} AND succeeded = false`;
  }
}
