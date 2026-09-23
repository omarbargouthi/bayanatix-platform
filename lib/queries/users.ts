import { sql } from "../db";
import type { SessionUser } from "../types";

type UserRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: SessionUser["role"];
  password_hash: string | null;
  auth_provider_code: "LOCAL" | "LDAP" | "OIDC";
  is_active: boolean;
  preferred_language_code: string | null;
  avatar_color_code: string | null;
  disabled_notification_types: string[];
};

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    select user_id, email, full_name, role, password_hash, auth_provider_code, is_active,
           preferred_language_code, avatar_color_code, disabled_notification_types
    from bayanat.users
    where lower(email) = lower(${email})
    limit 1
  `;
  return rows[0] ?? null;
}

export async function findUserById(userId: string) {
  const rows = await sql<UserRow[]>`
    select user_id, email, full_name, role, password_hash, auth_provider_code, is_active,
           preferred_language_code, avatar_color_code, disabled_notification_types
    from bayanat.users
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function setPreferredLanguage(userId: string, languageCode: string | null): Promise<void> {
  await sql`update bayanat.users set preferred_language_code = ${languageCode} where user_id = ${userId}`;
}

export async function setAvatarColor(userId: string, colorCode: string | null): Promise<void> {
  await sql`update bayanat.users set avatar_color_code = ${colorCode} where user_id = ${userId}`;
}

export async function setDisabledNotificationTypes(userId: string, types: string[]): Promise<void> {
  await sql`update bayanat.users set disabled_notification_types = ${types} where user_id = ${userId}`;
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await sql`update bayanat.users set password_hash = ${passwordHash} where user_id = ${userId}`;
}
