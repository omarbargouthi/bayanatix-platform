// LDAP directories (db/157): an organisation's separate user populations — employees,
// contractors, a subsidiary — each with its own connection and its own on/off switch.
// The sign-in screen lists the enabled ones and the user picks which to sign in to.
import { sql } from "../db";
import { encryptSecret, decryptSecret } from "../secrets";
import { logCreate, logUpdate } from "../audit";

/** Safe for API responses — the bind password is reduced to "is one set". */
export type LdapDirectory = {
  directoryId: number;
  directoryName: string;
  isEnabled: boolean;
  sortOrder: number;
  ldapUrl: string | null;
  ldapUseStartTls: boolean;
  ldapBindDn: string | null;
  hasBindCredential: boolean;
  ldapBaseDn: string | null;
  ldapUserFilter: string | null;
  ldapEmailAttr: string | null;
  ldapNameAttr: string | null;
  userCount: number;
};

/** Internal only (sign-in, test connection) — carries the decrypted bind password. */
export type LdapDirectoryConfig = Omit<LdapDirectory, "hasBindCredential" | "userCount"> & { ldapBindPassword: string | null };

export type LdapDirectoryInput = {
  directoryName?: string;
  isEnabled?: boolean;
  sortOrder?: number;
  ldapUrl?: string | null;
  ldapUseStartTls?: boolean;
  ldapBindDn?: string | null;
  ldapBindPassword?: string; // set / rotate only when provided non-empty
  ldapBaseDn?: string | null;
  ldapUserFilter?: string | null;
  ldapEmailAttr?: string | null;
  ldapNameAttr?: string | null;
};

export class LdapDirectoryError extends Error {}

const COLUMNS = sql`
  d.directory_id AS "directoryId", d.directory_name AS "directoryName", d.is_enabled AS "isEnabled",
  d.sort_order AS "sortOrder", d.url_text AS "ldapUrl", d.use_starttls_indicator AS "ldapUseStartTls",
  d.bind_dn_text AS "ldapBindDn", d.base_dn_text AS "ldapBaseDn", d.user_filter_text AS "ldapUserFilter",
  d.email_attr_text AS "ldapEmailAttr", d.name_attr_text AS "ldapNameAttr"
`;

export async function listLdapDirectories(): Promise<LdapDirectory[]> {
  return sql<LdapDirectory[]>`
    SELECT ${COLUMNS}, d.bind_credential_id IS NOT NULL AS "hasBindCredential",
           (SELECT count(*)::int FROM bayanat.users u WHERE u.ldap_directory_id = d.directory_id) AS "userCount"
    FROM bayanat.ldap_directories d
    ORDER BY d.sort_order, d.directory_name
  `;
}

/** The sign-in screen's list: enabled directories, names only. */
export async function listEnabledLdapDirectoryNames(): Promise<{ id: number; name: string }[]> {
  return sql<{ id: number; name: string }[]>`
    SELECT directory_id AS id, directory_name AS name FROM bayanat.ldap_directories
    WHERE is_enabled ORDER BY sort_order, directory_name
  `;
}

export async function getLdapDirectoryConfig(directoryId: number): Promise<LdapDirectoryConfig | null> {
  const [row] = await sql<(Omit<LdapDirectoryConfig, "ldapBindPassword"> & { bindCredentialId: number | null })[]>`
    SELECT ${COLUMNS}, d.bind_credential_id AS "bindCredentialId"
    FROM bayanat.ldap_directories d WHERE d.directory_id = ${directoryId}
  `;
  if (!row) return null;
  let ldapBindPassword: string | null = null;
  if (row.bindCredentialId != null) {
    const [cred] = await sql<{ ciphertextB64: string; ivB64: string; authTagB64: string }[]>`
      SELECT ciphertext_b64 AS "ciphertextB64", iv_b64 AS "ivB64", auth_tag_b64 AS "authTagB64"
      FROM bayanat.llm_credentials WHERE credential_id = ${row.bindCredentialId}
    `;
    ldapBindPassword = cred ? decryptSecret(cred) : null;
  }
  const { bindCredentialId: _omit, ...config } = row;
  void _omit;
  return { ...config, ldapBindPassword };
}

async function storeBindPassword(plaintext: string, userId: string): Promise<number> {
  const enc = encryptSecret(plaintext);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.llm_credentials (label_text, ciphertext_b64, iv_b64, auth_tag_b64, last4_text, rotated_at, created_by_user_id)
    VALUES ('ldap-bind-password', ${enc.ciphertextB64}, ${enc.ivB64}, ${enc.authTagB64}, ${enc.last4}, NOW(), ${userId})
    RETURNING credential_id AS id
  `;
  return row.id;
}

async function nameTaken(name: string, exceptId?: number): Promise<boolean> {
  const [row] = await sql<{ id: number }[]>`
    SELECT directory_id AS id FROM bayanat.ldap_directories
    WHERE lower(directory_name) = lower(${name}) AND directory_id IS DISTINCT FROM ${exceptId ?? null}::int
  `;
  return !!row;
}

export async function createLdapDirectory(input: LdapDirectoryInput, userId: string): Promise<number> {
  const name = input.directoryName?.trim();
  if (!name) throw new LdapDirectoryError("A name is required — it is what users see on the sign-in screen.");
  if (await nameTaken(name)) throw new LdapDirectoryError(`A directory named "${name}" already exists.`);
  const credentialId = input.ldapBindPassword?.trim() ? await storeBindPassword(input.ldapBindPassword.trim(), userId) : null;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.ldap_directories
      (directory_name, is_enabled, sort_order, url_text, use_starttls_indicator, bind_dn_text, bind_credential_id,
       base_dn_text, user_filter_text, email_attr_text, name_attr_text, updated_by_user_id)
    VALUES (
      ${name}, ${input.isEnabled ?? false},
      coalesce(${input.sortOrder ?? null}::int, (SELECT coalesce(max(sort_order), 0) + 1 FROM bayanat.ldap_directories)),
      ${input.ldapUrl ?? null}, ${input.ldapUseStartTls ?? false}, ${input.ldapBindDn ?? null}, ${credentialId},
      ${input.ldapBaseDn ?? null}, ${input.ldapUserFilter ?? "(mail={{username}})"},
      ${input.ldapEmailAttr ?? "mail"}, ${input.ldapNameAttr ?? "displayName"}, ${userId}
    )
    RETURNING directory_id AS id
  `;
  await logCreate("LDAP_DIRECTORY", row.id, userId, [{ field: "directory_name", newVal: name }]);
  return row.id;
}

export async function updateLdapDirectory(directoryId: number, input: LdapDirectoryInput, userId: string): Promise<void> {
  const [before] = await sql<{ name: string; isEnabled: boolean }[]>`
    SELECT directory_name AS name, is_enabled AS "isEnabled" FROM bayanat.ldap_directories WHERE directory_id = ${directoryId}
  `;
  if (!before) throw new LdapDirectoryError("Directory not found.");
  const name = input.directoryName !== undefined ? input.directoryName.trim() : before.name;
  if (!name) throw new LdapDirectoryError("A name is required — it is what users see on the sign-in screen.");
  if (await nameTaken(name, directoryId)) throw new LdapDirectoryError(`A directory named "${name}" already exists.`);
  const credentialId = input.ldapBindPassword?.trim() ? await storeBindPassword(input.ldapBindPassword.trim(), userId) : null;
  const keep = <T,>(v: T | undefined, column: ReturnType<typeof sql>) => (v !== undefined ? sql`${v as never}` : column);
  await sql`
    UPDATE bayanat.ldap_directories SET
      directory_name         = ${name},
      is_enabled             = ${input.isEnabled ?? before.isEnabled},
      sort_order             = coalesce(${input.sortOrder ?? null}::int, sort_order),
      url_text               = ${keep(input.ldapUrl, sql`url_text`)},
      use_starttls_indicator = coalesce(${input.ldapUseStartTls ?? null}::boolean, use_starttls_indicator),
      bind_dn_text           = ${keep(input.ldapBindDn, sql`bind_dn_text`)},
      bind_credential_id     = coalesce(${credentialId}::int, bind_credential_id),
      base_dn_text           = ${keep(input.ldapBaseDn, sql`base_dn_text`)},
      user_filter_text       = ${keep(input.ldapUserFilter, sql`user_filter_text`)},
      email_attr_text        = ${keep(input.ldapEmailAttr, sql`email_attr_text`)},
      name_attr_text         = ${keep(input.ldapNameAttr, sql`name_attr_text`)},
      updated_at             = NOW(),
      updated_by_user_id     = ${userId}
    WHERE directory_id = ${directoryId}
  `;
  await logUpdate("LDAP_DIRECTORY", directoryId, userId, [
    { field: "directory_name", oldVal: before.name, newVal: name },
    { field: "is_enabled", oldVal: String(before.isEnabled), newVal: String(input.isEnabled ?? before.isEnabled) },
  ]);
}

/** Its users keep their accounts but can no longer sign in through it (ldap_directory_id is cleared). */
export async function deleteLdapDirectory(directoryId: number, userId: string): Promise<void> {
  const [row] = await sql<{ name: string }[]>`
    DELETE FROM bayanat.ldap_directories WHERE directory_id = ${directoryId} RETURNING directory_name AS name
  `;
  if (!row) throw new LdapDirectoryError("Directory not found.");
  await logUpdate("LDAP_DIRECTORY", directoryId, userId, [{ field: "deleted", oldVal: row.name, newVal: null, force: true }]);
}
