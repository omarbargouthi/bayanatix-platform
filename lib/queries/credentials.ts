import { sql } from "../db";
import { sealSecret, openSecret } from "../secrets";
import { isVaultRef, vaultRefPath } from "../secrets-vault";

// bayanat.llm_credentials: the write-only store for AI provider keys, LDAP bind
// passwords and the SSO client secret. Rows are referenced by id from the table
// that uses them; only the last four characters are ever shown, or, for a Vault
// reference ("ref:vault:<path>#<field>"), where in Vault the value is kept.

/** SQL for the Vault reference path of llm_credentials row alias "c" (null when it holds a value). */
export const CREDENTIAL_REF_SQL = `CASE WHEN c.sealed_text LIKE 'ref:vault:%' THEN substr(c.sealed_text, 11) END`;

export async function storeCredential(label: string, plaintext: string, userId: string): Promise<{ id: number; last4: string | null; ref: string | null }> {
  const sealed = await sealSecret(plaintext);
  const ref = vaultRefPath(sealed);
  const last4 = isVaultRef(sealed) ? null : plaintext.slice(-4);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.llm_credentials (label_text, sealed_text, last4_text, rotated_at, created_by_user_id)
    VALUES (${label}, ${sealed}, ${last4}, NOW(), ${userId})
    RETURNING credential_id AS id
  `;
  return { id: row.id, last4, ref };
}

/** Where in Vault a credential is kept, when it is a Vault reference. Not secret. */
export async function credentialRef(credentialId: number | null): Promise<string | null> {
  if (credentialId == null) return null;
  const [row] = await sql<{ sealed: string }[]>`SELECT sealed_text AS sealed FROM bayanat.llm_credentials WHERE credential_id = ${credentialId}`;
  return vaultRefPath(row?.sealed);
}

/** Internal only — never call from an API route response path. */
export async function readCredential(credentialId: number): Promise<string | null> {
  const [row] = await sql<{ sealed: string }[]>`
    SELECT sealed_text AS sealed FROM bayanat.llm_credentials WHERE credential_id = ${credentialId}
  `;
  return row ? openSecret(row.sealed) : null;
}
