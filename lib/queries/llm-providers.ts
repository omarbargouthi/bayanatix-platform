// LLM Provider Configuration — storage layer (spec §2, §3, §6).

import { sql } from "../db";
import { logCreate, logUpdate } from "../audit";
import { encryptSecret, decryptSecret } from "../secrets";

export type ProviderType = "MANAGED_API" | "CLOUD_REGION" | "SELF_HOSTED";
export type ApiFlavor = "OPENAI_COMPAT" | "ANTHROPIC" | "BEDROCK" | "VERTEX";
export type HealthStatus = "UNKNOWN" | "HEALTHY" | "UNHEALTHY";
export type Capability = "DESCRIBE" | "REPHRASE" | "DQ_SEMANTIC" | "CHAT" | "TRANSLATE";

export type ProviderProfile = {
  profileId: number;
  profileName: string;
  providerType: ProviderType;
  apiFlavor: ApiFlavor;
  baseUrl: string;
  modelName: string;
  hasCredential: boolean;
  credentialLast4: string | null;
  credentialRotatedAt: string | null;
  region: string | null;
  maxTokens: number;
  temperature: number;
  timeoutSeconds: number;
  dailyTokenBudget: number | null;
  isEnabled: boolean;
  isDefault: boolean;
  allowSampleValues: boolean;
  notes: string | null;
  healthStatus: HealthStatus;
  healthCheckedAt: string | null;
  healthMessage: string | null;
};

const PROFILE_COLS = `
  p.profile_id AS "profileId", p.profile_name_text AS "profileName", p.provider_type_code AS "providerType",
  p.api_flavor_code AS "apiFlavor", p.base_url_text AS "baseUrl", p.model_name_text AS "modelName",
  (p.credential_id IS NOT NULL) AS "hasCredential", c.last4_text AS "credentialLast4", c.rotated_at::text AS "credentialRotatedAt",
  p.region_text AS "region", p.max_tokens_int AS "maxTokens", p.temperature_number AS "temperature",
  p.timeout_seconds_int AS "timeoutSeconds", p.daily_token_budget AS "dailyTokenBudget",
  p.is_enabled_indicator AS "isEnabled", p.is_default_indicator AS "isDefault",
  p.allow_sample_values_indicator AS "allowSampleValues", p.notes_text AS "notes",
  p.last_health_status_code AS "healthStatus", p.last_health_checked_at::text AS "healthCheckedAt",
  p.last_health_message_text AS "healthMessage"
`;

export async function listProfiles(): Promise<ProviderProfile[]> {
  const rows = await sql<ProviderProfile[]>`
    SELECT ${sql.unsafe(PROFILE_COLS)}
    FROM bayanat.llm_provider_profiles p
    LEFT JOIN bayanat.llm_credentials c ON c.credential_id = p.credential_id
    ORDER BY p.is_default_indicator DESC, p.profile_name_text
  `;
  return rows.map((r) => ({ ...r, temperature: Number(r.temperature) }));
}

export async function getProfileById(profileId: number): Promise<ProviderProfile | null> {
  const rows = await sql<ProviderProfile[]>`
    SELECT ${sql.unsafe(PROFILE_COLS)}
    FROM bayanat.llm_provider_profiles p
    LEFT JOIN bayanat.llm_credentials c ON c.credential_id = p.credential_id
    WHERE p.profile_id = ${profileId}
  `;
  const row = rows[0];
  return row ? { ...row, temperature: Number(row.temperature) } : null;
}

export async function createProfile(data: {
  profileName: string; providerType: ProviderType; apiFlavor: ApiFlavor; baseUrl: string; modelName: string;
  region?: string | null; maxTokens?: number; temperature?: number; timeoutSeconds?: number;
  dailyTokenBudget?: number | null; isEnabled?: boolean; allowSampleValues?: boolean; notes?: string | null;
}, userId: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.llm_provider_profiles
      (profile_name_text, provider_type_code, api_flavor_code, base_url_text, model_name_text, region_text,
       max_tokens_int, temperature_number, timeout_seconds_int, daily_token_budget, is_enabled_indicator,
       allow_sample_values_indicator, notes_text)
    VALUES (
      ${data.profileName}, ${data.providerType}, ${data.apiFlavor}, ${data.baseUrl}, ${data.modelName}, ${data.region ?? null},
      ${data.maxTokens ?? 2048}, ${data.temperature ?? 0.2}, ${data.timeoutSeconds ?? 60}, ${data.dailyTokenBudget ?? null},
      ${data.isEnabled ?? true}, ${data.allowSampleValues ?? false}, ${data.notes ?? null}
    )
    RETURNING profile_id AS id
  `;
  await logCreate("LLM_PROVIDER_PROFILES", row.id, userId, [
    { field: "profile_name_text", newVal: data.profileName },
    { field: "provider_type_code", newVal: data.providerType },
    { field: "base_url_text", newVal: data.baseUrl },
    { field: "model_name_text", newVal: data.modelName },
  ]);
  return row.id;
}

export async function updateProfile(profileId: number, patch: Partial<{
  profileName: string; providerType: ProviderType; apiFlavor: ApiFlavor; baseUrl: string; modelName: string;
  region: string | null; maxTokens: number; temperature: number; timeoutSeconds: number;
  dailyTokenBudget: number | null; isEnabled: boolean; allowSampleValues: boolean; notes: string | null;
}>, userId: string): Promise<void> {
  const before = await getProfileById(profileId);
  if (!before) throw new Error("Profile not found");

  await sql`
    UPDATE bayanat.llm_provider_profiles SET
      profile_name_text     = coalesce(${patch.profileName ?? null}, profile_name_text),
      provider_type_code    = coalesce(${patch.providerType ?? null}, provider_type_code),
      api_flavor_code       = coalesce(${patch.apiFlavor ?? null}, api_flavor_code),
      base_url_text         = coalesce(${patch.baseUrl ?? null}, base_url_text),
      model_name_text       = coalesce(${patch.modelName ?? null}, model_name_text),
      region_text           = ${patch.region !== undefined ? patch.region : sql`region_text`},
      max_tokens_int        = coalesce(${patch.maxTokens ?? null}, max_tokens_int),
      temperature_number    = coalesce(${patch.temperature ?? null}, temperature_number),
      timeout_seconds_int   = coalesce(${patch.timeoutSeconds ?? null}, timeout_seconds_int),
      daily_token_budget    = ${patch.dailyTokenBudget !== undefined ? patch.dailyTokenBudget : sql`daily_token_budget`},
      is_enabled_indicator  = coalesce(${patch.isEnabled ?? null}, is_enabled_indicator),
      allow_sample_values_indicator = coalesce(${patch.allowSampleValues ?? null}, allow_sample_values_indicator),
      notes_text            = ${patch.notes !== undefined ? patch.notes : sql`notes_text`},
      updated_at            = NOW()
    WHERE profile_id = ${profileId}
  `;

  await logUpdate("LLM_PROVIDER_PROFILES", profileId, userId, [
    { field: "profile_name_text", oldVal: before.profileName, newVal: patch.profileName ?? before.profileName },
    { field: "base_url_text", oldVal: before.baseUrl, newVal: patch.baseUrl ?? before.baseUrl },
    { field: "model_name_text", oldVal: before.modelName, newVal: patch.modelName ?? before.modelName },
    { field: "is_enabled_indicator", oldVal: String(before.isEnabled), newVal: String(patch.isEnabled ?? before.isEnabled) },
    { field: "allow_sample_values_indicator", oldVal: String(before.allowSampleValues), newVal: String(patch.allowSampleValues ?? before.allowSampleValues) },
  ]);
}

export async function deleteProfile(profileId: number, userId: string): Promise<void> {
  await sql`DELETE FROM bayanat.llm_provider_profiles WHERE profile_id = ${profileId}`;
  await logUpdate("LLM_PROVIDER_PROFILES", profileId, userId, [{ field: "deleted", oldVal: "false", newVal: "true", force: true }]);
}

/** Exactly one default (spec AC5) — atomic via a transaction, not a partial unique index. */
export async function setDefaultProfile(profileId: number, userId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`UPDATE bayanat.llm_provider_profiles SET is_default_indicator = false WHERE is_default_indicator = true`;
    await tx`UPDATE bayanat.llm_provider_profiles SET is_default_indicator = true WHERE profile_id = ${profileId}`;
  });
  await logUpdate("LLM_PROVIDER_PROFILES", profileId, userId, [{ field: "is_default_indicator", oldVal: "false", newVal: "true", force: true }]);
}

/** Write-only: sets/rotates a profile's credential. Never returns the plaintext again. */
export async function setCredential(profileId: number, plaintextKey: string, userId: string): Promise<void> {
  if (!plaintextKey.trim()) throw new Error("Credential value cannot be empty");
  const enc = encryptSecret(plaintextKey.trim());
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.llm_credentials (label_text, ciphertext_b64, iv_b64, auth_tag_b64, last4_text, rotated_at, created_by_user_id)
    VALUES (${`profile-${profileId}`}, ${enc.ciphertextB64}, ${enc.ivB64}, ${enc.authTagB64}, ${enc.last4}, NOW(), ${userId})
    RETURNING credential_id AS id
  `;
  await sql`UPDATE bayanat.llm_provider_profiles SET credential_id = ${row.id}, updated_at = NOW() WHERE profile_id = ${profileId}`;
  await logUpdate("LLM_PROVIDER_PROFILES", profileId, userId, [{ field: "credential", oldVal: null, newVal: `rotated (••••${enc.last4})`, force: true }]);
}

/** Internal only — never call from an API route response path. */
export async function getDecryptedCredential(profileId: number): Promise<string | null> {
  const [row] = await sql<{ ciphertextB64: string; ivB64: string; authTagB64: string }[]>`
    SELECT c.ciphertext_b64 AS "ciphertextB64", c.iv_b64 AS "ivB64", c.auth_tag_b64 AS "authTagB64"
    FROM bayanat.llm_provider_profiles p
    JOIN bayanat.llm_credentials c ON c.credential_id = p.credential_id
    WHERE p.profile_id = ${profileId}
  `;
  if (!row) return null;
  return decryptSecret(row);
}

export async function updateHealthStatus(profileId: number, status: HealthStatus, message: string | null): Promise<void> {
  await sql`
    UPDATE bayanat.llm_provider_profiles
    SET last_health_status_code = ${status}, last_health_checked_at = NOW(), last_health_message_text = ${message}
    WHERE profile_id = ${profileId}
  `;
}

// ── Capability routing ──────────────────────────────────────────────────────────

export type CapabilityRoute = { capabilityCode: Capability; profileId: number | null; fallbackProfileId: number | null };

export async function listCapabilityRoutes(): Promise<CapabilityRoute[]> {
  const rows = await sql<CapabilityRoute[]>`
    SELECT capability_code AS "capabilityCode", profile_id AS "profileId", fallback_profile_id AS "fallbackProfileId"
    FROM bayanat.llm_capability_routes
  `;
  const byCode = new Map(rows.map((r) => [r.capabilityCode, r]));
  const ALL: Capability[] = ["DESCRIBE", "REPHRASE", "DQ_SEMANTIC", "CHAT", "TRANSLATE"];
  return ALL.map((code) => byCode.get(code) ?? { capabilityCode: code, profileId: null, fallbackProfileId: null });
}

export async function upsertCapabilityRoute(capabilityCode: Capability, profileId: number | null, fallbackProfileId: number | null, userId: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.llm_capability_routes (capability_code, profile_id, fallback_profile_id)
    VALUES (${capabilityCode}, ${profileId}, ${fallbackProfileId})
    ON CONFLICT (capability_code) DO UPDATE SET profile_id = ${profileId}, fallback_profile_id = ${fallbackProfileId}
  `;
  await logUpdate("LLM_CAPABILITY_ROUTES", profileId ?? 0, userId, [
    { field: `route.${capabilityCode}`, oldVal: null, newVal: `profile=${profileId ?? "default"} fallback=${fallbackProfileId ?? "none"}`, force: true },
  ]);
}

export async function resolveRouteForCapability(capabilityCode: Capability): Promise<CapabilityRoute | null> {
  const [row] = await sql<CapabilityRoute[]>`
    SELECT capability_code AS "capabilityCode", profile_id AS "profileId", fallback_profile_id AS "fallbackProfileId"
    FROM bayanat.llm_capability_routes WHERE capability_code = ${capabilityCode}
  `;
  return row ?? null;
}

export async function getDefaultProfileId(): Promise<number | null> {
  const [row] = await sql<{ id: number }[]>`SELECT profile_id AS id FROM bayanat.llm_provider_profiles WHERE is_default_indicator = true LIMIT 1`;
  return row?.id ?? null;
}

// ── Usage log ────────────────────────────────────────────────────────────────────

export async function logUsage(profileId: number, capabilityCode: Capability | "TEST_CONNECTION", inputTokens: number, outputTokens: number, success: boolean, errorText?: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.llm_usage_log (profile_id, capability_code, input_tokens, output_tokens, success_indicator, error_text)
    VALUES (${profileId}, ${capabilityCode}, ${inputTokens}, ${outputTokens}, ${success}, ${errorText ?? null})
  `;
}

export async function getTokensUsedToday(profileId: number): Promise<number> {
  const [row] = await sql<{ total: number | null }[]>`
    SELECT sum(input_tokens + output_tokens)::int AS total FROM bayanat.llm_usage_log
    WHERE profile_id = ${profileId} AND logged_at >= CURRENT_DATE
  `;
  return row?.total ?? 0;
}

export type UsageDashboardRow = {
  profileId: number; profileName: string; capabilityCode: string;
  callsToday: number; tokensToday: number; failuresToday: number;
};

export async function getUsageDashboard(): Promise<UsageDashboardRow[]> {
  return sql<UsageDashboardRow[]>`
    SELECT p.profile_id AS "profileId", p.profile_name_text AS "profileName", u.capability_code AS "capabilityCode",
           count(*)::int AS "callsToday", sum(u.input_tokens + u.output_tokens)::int AS "tokensToday",
           count(*) FILTER (WHERE NOT u.success_indicator)::int AS "failuresToday"
    FROM bayanat.llm_usage_log u
    JOIN bayanat.llm_provider_profiles p ON p.profile_id = u.profile_id
    WHERE u.logged_at >= CURRENT_DATE
    GROUP BY p.profile_id, p.profile_name_text, u.capability_code
    ORDER BY p.profile_name_text, u.capability_code
  `;
}
