import { sql } from "../db";
import { sealSecret, openSecret } from "../secrets";

// bayanat.llm_credentials: the write-only store for AI provider keys, LDAP bind
// passwords and the SSO client secret. Rows are referenced by id from the table
// that uses them; only the last four characters are ever shown.

export async function storeCredential(label: string, plaintext: string, userId: string): Promise<{ id: number; last4: string }> {
  const sealed = await sealSecret(plaintext);
  const last4 = plaintext.slice(-4);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.llm_credentials (label_text, sealed_text, last4_text, rotated_at, created_by_user_id)
    VALUES (${label}, ${sealed}, ${last4}, NOW(), ${userId})
    RETURNING credential_id AS id
  `;
  return { id: row.id, last4 };
}

/** Internal only — never call from an API route response path. */
export async function readCredential(credentialId: number): Promise<string | null> {
  const [row] = await sql<{ sealed: string }[]>`
    SELECT sealed_text AS sealed FROM bayanat.llm_credentials WHERE credential_id = ${credentialId}
  `;
  return row ? openSecret(row.sealed) : null;
}
