import { sql } from "../db";
import type { SessionUser } from "../types";

type UserRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: SessionUser["role"];
  password_hash: string;
  preferred_language_code: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    select user_id, email, full_name, role, password_hash, preferred_language_code
    from bayanat.users
    where lower(email) = lower(${email})
    limit 1
  `;
  return rows[0] ?? null;
}

export async function findUserById(userId: string) {
  const rows = await sql<UserRow[]>`
    select user_id, email, full_name, role, password_hash, preferred_language_code
    from bayanat.users
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function setPreferredLanguage(userId: string, languageCode: string | null): Promise<void> {
  await sql`update bayanat.users set preferred_language_code = ${languageCode} where user_id = ${userId}`;
}
