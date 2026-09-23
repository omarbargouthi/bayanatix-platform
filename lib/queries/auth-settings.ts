import { sql } from "../db";
import { encryptSecret, decryptSecret } from "../secrets";
import { logUpdate } from "../audit";

export type AuthSettings = {
  localEnabled: boolean;
  ldapEnabled: boolean;
  oidcEnabled: boolean;

  ldapUrl: string | null;
  ldapUseStartTls: boolean;
  ldapBindDn: string | null;
  ldapHasBindCredential: boolean;
  ldapBaseDn: string | null;
  ldapUserFilter: string | null;
  ldapEmailAttr: string | null;
  ldapNameAttr: string | null;

  oidcIssuerUrl: string | null;
  oidcClientId: string | null;
  oidcHasClientCredential: boolean;
  oidcRedirectUri: string | null;
  oidcScopes: string | null;

  autoProvisionRoleId: number | null;
  autoProvisionSourceIds: number[] | null;
};

type Row = {
  localEnabled: boolean;
  ldapEnabled: boolean;
  oidcEnabled: boolean;
  ldapUrl: string | null;
  ldapUseStartTls: boolean;
  ldapBindDn: string | null;
  ldapBindCredentialId: number | null;
  ldapBaseDn: string | null;
  ldapUserFilter: string | null;
  ldapEmailAttr: string | null;
  ldapNameAttr: string | null;
  oidcIssuerUrl: string | null;
  oidcClientId: string | null;
  oidcClientCredentialId: number | null;
  oidcRedirectUri: string | null;
  oidcScopes: string | null;
  autoProvisionRoleId: number | null;
  autoProvisionSourceIds: number[] | null;
};

async function getRow(): Promise<Row> {
  const [row] = await sql<Row[]>`
    SELECT
      local_enabled AS "localEnabled", ldap_enabled AS "ldapEnabled", oidc_enabled AS "oidcEnabled",
      ldap_url_text AS "ldapUrl", ldap_use_starttls_indicator AS "ldapUseStartTls",
      ldap_bind_dn_text AS "ldapBindDn", ldap_bind_credential_id AS "ldapBindCredentialId",
      ldap_base_dn_text AS "ldapBaseDn", ldap_user_filter_text AS "ldapUserFilter",
      ldap_email_attr_text AS "ldapEmailAttr", ldap_name_attr_text AS "ldapNameAttr",
      oidc_issuer_url_text AS "oidcIssuerUrl", oidc_client_id_text AS "oidcClientId",
      oidc_client_credential_id AS "oidcClientCredentialId", oidc_redirect_uri_text AS "oidcRedirectUri",
      oidc_scopes_text AS "oidcScopes",
      auto_provision_role_id AS "autoProvisionRoleId", auto_provision_source_ids AS "autoProvisionSourceIds"
    FROM bayanat.auth_settings WHERE id = 1
  `;
  return row;
}

/** Safe for API responses — secrets are reduced to a boolean "is one set". */
export async function getAuthSettings(): Promise<AuthSettings> {
  const row = await getRow();
  return {
    localEnabled: row.localEnabled,
    ldapEnabled: row.ldapEnabled,
    oidcEnabled: row.oidcEnabled,
    ldapUrl: row.ldapUrl,
    ldapUseStartTls: row.ldapUseStartTls,
    ldapBindDn: row.ldapBindDn,
    ldapHasBindCredential: row.ldapBindCredentialId != null,
    ldapBaseDn: row.ldapBaseDn,
    ldapUserFilter: row.ldapUserFilter,
    ldapEmailAttr: row.ldapEmailAttr,
    ldapNameAttr: row.ldapNameAttr,
    oidcIssuerUrl: row.oidcIssuerUrl,
    oidcClientId: row.oidcClientId,
    oidcHasClientCredential: row.oidcClientCredentialId != null,
    oidcRedirectUri: row.oidcRedirectUri,
    oidcScopes: row.oidcScopes,
    autoProvisionRoleId: row.autoProvisionRoleId,
    autoProvisionSourceIds: row.autoProvisionSourceIds,
  };
}

/** Internal only (login route, test-connection route) — never expose these plaintext values in an API response. */
export type ResolvedAuthConfig = Row & { ldapBindPassword: string | null; oidcClientSecret: string | null };

export async function getResolvedAuthConfig(): Promise<ResolvedAuthConfig> {
  const row = await getRow();
  const [ldapCred, oidcCred] = await Promise.all([
    row.ldapBindCredentialId != null ? getDecryptedById(row.ldapBindCredentialId) : Promise.resolve(null),
    row.oidcClientCredentialId != null ? getDecryptedById(row.oidcClientCredentialId) : Promise.resolve(null),
  ]);
  return { ...row, ldapBindPassword: ldapCred, oidcClientSecret: oidcCred };
}

async function getDecryptedById(credentialId: number): Promise<string | null> {
  const [row] = await sql<{ ciphertextB64: string; ivB64: string; authTagB64: string }[]>`
    SELECT ciphertext_b64 AS "ciphertextB64", iv_b64 AS "ivB64", auth_tag_b64 AS "authTagB64"
    FROM bayanat.llm_credentials WHERE credential_id = ${credentialId}
  `;
  if (!row) return null;
  return decryptSecret(row);
}

async function storeSecret(label: string, plaintext: string, userId: string): Promise<number> {
  const enc = encryptSecret(plaintext);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.llm_credentials (label_text, ciphertext_b64, iv_b64, auth_tag_b64, last4_text, rotated_at, created_by_user_id)
    VALUES (${label}, ${enc.ciphertextB64}, ${enc.ivB64}, ${enc.authTagB64}, ${enc.last4}, NOW(), ${userId})
    RETURNING credential_id AS id
  `;
  return row.id;
}

export type AuthSettingsPatch = {
  localEnabled?: boolean;
  ldapEnabled?: boolean;
  oidcEnabled?: boolean;
  ldapUrl?: string | null;
  ldapUseStartTls?: boolean;
  ldapBindDn?: string | null;
  ldapBindPassword?: string; // set/rotate only when provided non-empty
  ldapBaseDn?: string | null;
  ldapUserFilter?: string | null;
  ldapEmailAttr?: string | null;
  ldapNameAttr?: string | null;
  oidcIssuerUrl?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string; // set/rotate only when provided non-empty
  oidcRedirectUri?: string | null;
  oidcScopes?: string | null;
  autoProvisionRoleId?: number | null;
  autoProvisionSourceIds?: number[] | null;
};

export class AuthSettingsError extends Error {}

export async function updateAuthSettings(patch: AuthSettingsPatch, userId: string): Promise<void> {
  const before = await getRow();

  const nextLocal = patch.localEnabled ?? before.localEnabled;
  const nextLdap = patch.ldapEnabled ?? before.ldapEnabled;
  const nextOidc = patch.oidcEnabled ?? before.oidcEnabled;
  if (!nextLocal && !nextLdap && !nextOidc) {
    throw new AuthSettingsError("At least one sign-in method must stay enabled.");
  }

  let ldapBindCredentialId = before.ldapBindCredentialId;
  if (patch.ldapBindPassword?.trim()) {
    ldapBindCredentialId = await storeSecret("ldap-bind-password", patch.ldapBindPassword.trim(), userId);
  }
  let oidcClientCredentialId = before.oidcClientCredentialId;
  if (patch.oidcClientSecret?.trim()) {
    oidcClientCredentialId = await storeSecret("oidc-client-secret", patch.oidcClientSecret.trim(), userId);
  }

  await sql`
    UPDATE bayanat.auth_settings SET
      local_enabled                = ${nextLocal},
      ldap_enabled                 = ${nextLdap},
      oidc_enabled                 = ${nextOidc},
      ldap_url_text                = ${patch.ldapUrl !== undefined ? patch.ldapUrl : sql`ldap_url_text`},
      ldap_use_starttls_indicator  = coalesce(${patch.ldapUseStartTls ?? null}, ldap_use_starttls_indicator),
      ldap_bind_dn_text            = ${patch.ldapBindDn !== undefined ? patch.ldapBindDn : sql`ldap_bind_dn_text`},
      ldap_bind_credential_id      = ${ldapBindCredentialId},
      ldap_base_dn_text            = ${patch.ldapBaseDn !== undefined ? patch.ldapBaseDn : sql`ldap_base_dn_text`},
      ldap_user_filter_text        = ${patch.ldapUserFilter !== undefined ? patch.ldapUserFilter : sql`ldap_user_filter_text`},
      ldap_email_attr_text         = ${patch.ldapEmailAttr !== undefined ? patch.ldapEmailAttr : sql`ldap_email_attr_text`},
      ldap_name_attr_text          = ${patch.ldapNameAttr !== undefined ? patch.ldapNameAttr : sql`ldap_name_attr_text`},
      oidc_issuer_url_text         = ${patch.oidcIssuerUrl !== undefined ? patch.oidcIssuerUrl : sql`oidc_issuer_url_text`},
      oidc_client_id_text          = ${patch.oidcClientId !== undefined ? patch.oidcClientId : sql`oidc_client_id_text`},
      oidc_client_credential_id    = ${oidcClientCredentialId},
      oidc_redirect_uri_text       = ${patch.oidcRedirectUri !== undefined ? patch.oidcRedirectUri : sql`oidc_redirect_uri_text`},
      oidc_scopes_text             = ${patch.oidcScopes !== undefined ? patch.oidcScopes : sql`oidc_scopes_text`},
      auto_provision_role_id       = ${patch.autoProvisionRoleId !== undefined ? patch.autoProvisionRoleId : sql`auto_provision_role_id`},
      auto_provision_source_ids    = ${patch.autoProvisionSourceIds !== undefined ? patch.autoProvisionSourceIds : sql`auto_provision_source_ids`},
      updated_at                   = NOW(),
      updated_by_user_id           = ${userId}
    WHERE id = 1
  `;

  await logUpdate("AUTH_SETTINGS", 1, userId, [
    { field: "local_enabled", oldVal: String(before.localEnabled), newVal: String(nextLocal) },
    { field: "ldap_enabled", oldVal: String(before.ldapEnabled), newVal: String(nextLdap) },
    { field: "oidc_enabled", oldVal: String(before.oidcEnabled), newVal: String(nextOidc) },
  ]);
}

/** Public, unauthenticated shape — just enough for the login page to build its provider picker. No secrets, no internal ids. */
export async function getPublicAuthConfig(): Promise<{ local: boolean; ldap: boolean; oidc: boolean }> {
  const [row] = await sql<{ local: boolean; ldap: boolean; oidc: boolean }[]>`
    SELECT local_enabled AS local, ldap_enabled AS ldap, oidc_enabled AS oidc FROM bayanat.auth_settings WHERE id = 1
  `;
  return row ?? { local: true, ldap: false, oidc: false };
}
