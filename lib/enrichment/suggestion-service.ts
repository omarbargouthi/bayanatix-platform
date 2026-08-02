// AI Metadata Enrichment — SuggestionService (spec §1): the single internal service
// LLM calls are abstracted behind. Handles provider/model config, timeout, a per-day
// token budget with graceful pause (NFR-4), and prompt/response provenance (context
// hash + manifest, never the withheld sensitive values themselves) for audit (NFR-2).
// Claude API only for v1, dynamically imported exactly like the existing compliance
// translation feature (app/api/governance/compliance/[frameworkId]/translate/route.ts).

import crypto from "crypto";
import { sql } from "../db";
import type { ContextPackage } from "./context";

export type EnrichmentSettings = {
  providerCode: string;
  modelRef: string;
  requestTimeoutMs: number;
  batchSize: number;
  nullCheckBufferPct: number;
  nullCheckSoftThresholdPct: number;
  uniquenessBufferPct: number;
  profileFreshnessDays: number;
  dailyTokenBudget: number;
  tokensUsedToday: number;
  defaultLanguageCode: string;
  allowedEndpoints: string[];
};

type SettingsRow = {
  providerCode: string; modelRef: string; requestTimeoutMs: number; batchSize: number;
  nullCheckBufferPct: string; nullCheckSoftThresholdPct: string; uniquenessBufferPct: string;
  profileFreshnessDays: number; dailyTokenBudget: number; tokensUsedToday: number;
  tokenBudgetResetDate: string; defaultLanguageCode: string; allowedEndpoints: string[];
};

export async function getEnrichmentSettings(): Promise<EnrichmentSettings> {
  const [row] = await sql<SettingsRow[]>`
    SELECT provider_code AS "providerCode", model_ref_text AS "modelRef",
           request_timeout_ms AS "requestTimeoutMs", batch_size AS "batchSize",
           null_check_buffer_pct AS "nullCheckBufferPct", null_check_soft_threshold_pct AS "nullCheckSoftThresholdPct",
           uniqueness_buffer_pct AS "uniquenessBufferPct", profile_freshness_days AS "profileFreshnessDays",
           daily_token_budget AS "dailyTokenBudget", tokens_used_today AS "tokensUsedToday",
           token_budget_reset_date::text AS "tokenBudgetResetDate", default_language_code AS "defaultLanguageCode",
           allowed_endpoints_json AS "allowedEndpoints"
    FROM bayanat.enrichment_settings WHERE settings_id = 1
  `;
  // Roll the daily token counter over on first use of a new day.
  const today = new Date().toISOString().slice(0, 10);
  if (row.tokenBudgetResetDate !== today) {
    await sql`UPDATE bayanat.enrichment_settings SET tokens_used_today = 0, token_budget_reset_date = ${today} WHERE settings_id = 1`;
    row.tokensUsedToday = 0;
  }
  return {
    providerCode: row.providerCode, modelRef: row.modelRef, requestTimeoutMs: row.requestTimeoutMs,
    batchSize: row.batchSize, nullCheckBufferPct: Number(row.nullCheckBufferPct),
    nullCheckSoftThresholdPct: Number(row.nullCheckSoftThresholdPct), uniquenessBufferPct: Number(row.uniquenessBufferPct),
    profileFreshnessDays: row.profileFreshnessDays, dailyTokenBudget: row.dailyTokenBudget,
    tokensUsedToday: row.tokensUsedToday, defaultLanguageCode: row.defaultLanguageCode,
    allowedEndpoints: row.allowedEndpoints ?? [],
  };
}

export async function updateEnrichmentSettings(patch: {
  providerCode?: string; modelRef?: string; requestTimeoutMs?: number; batchSize?: number;
  nullCheckBufferPct?: number; nullCheckSoftThresholdPct?: number; uniquenessBufferPct?: number;
  profileFreshnessDays?: number; dailyTokenBudget?: number; defaultLanguageCode?: string;
  allowedEndpoints?: string[];
}): Promise<void> {
  await sql`
    UPDATE bayanat.enrichment_settings SET
      provider_code                  = coalesce(${patch.providerCode ?? null}, provider_code),
      model_ref_text                 = coalesce(${patch.modelRef ?? null}, model_ref_text),
      request_timeout_ms             = coalesce(${patch.requestTimeoutMs ?? null}, request_timeout_ms),
      batch_size                     = coalesce(${patch.batchSize ?? null}, batch_size),
      null_check_buffer_pct          = coalesce(${patch.nullCheckBufferPct ?? null}, null_check_buffer_pct),
      null_check_soft_threshold_pct  = coalesce(${patch.nullCheckSoftThresholdPct ?? null}, null_check_soft_threshold_pct),
      uniqueness_buffer_pct          = coalesce(${patch.uniquenessBufferPct ?? null}, uniqueness_buffer_pct),
      profile_freshness_days         = coalesce(${patch.profileFreshnessDays ?? null}, profile_freshness_days),
      daily_token_budget             = coalesce(${patch.dailyTokenBudget ?? null}, daily_token_budget),
      default_language_code          = coalesce(${patch.defaultLanguageCode ?? null}, default_language_code),
      allowed_endpoints_json         = coalesce(${(patch.allowedEndpoints ?? null) as any}, allowed_endpoints_json)
    WHERE settings_id = 1
  `;
}

async function recordTokenUsage(tokens: number): Promise<void> {
  if (tokens <= 0) return;
  await sql`UPDATE bayanat.enrichment_settings SET tokens_used_today = tokens_used_today + ${tokens} WHERE settings_id = 1`;
}

// ── Provenance helpers (NFR-2 / NFR-3 / AC8) ────────────────────────────────────

export function buildContextManifest(ctx: ContextPackage): Record<string, unknown> {
  return {
    asset_type: ctx.assetType,
    asset_id: ctx.assetId,
    signals_included: {
      structure: true,
      relationships: ctx.outboundFks.length > 0 || ctx.inboundFks.length > 0,
      profiling: !!ctx.profiling,
      glossary: !!ctx.glossaryMatch,
      sample_values: !!(ctx.sampleValuesAllowed && ctx.sampleValues?.length),
    },
    sample_values_withheld_reason: ctx.sampleValuesAllowed
      ? null
      : ctx.isPii
        ? "PI category present"
        : ctx.effectiveClassification
          ? `classification=${ctx.effectiveClassification}`
          : null,
  };
}

export function hashPromptContext(prompt: string, ctx: ContextPackage): string {
  return crypto.createHash("sha256").update(`${ctx.assetType}:${ctx.assetId}:${prompt}`).digest("hex");
}

// ── LLM transport ────────────────────────────────────────────────────────────────

export type LlmCallResult =
  | { ok: true; text: string; modelRef: string; contextHash: string; contextManifest: Record<string, unknown> }
  | { ok: false; error: string };

async function callAnthropic(prompt: string, settings: EnrichmentSettings, maxTokens: number): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI enrichment is not configured — add ANTHROPIC_API_KEY to .env.local");

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey, timeout: settings.requestTimeoutMs });
  const response = await client.messages.create({
    model: settings.modelRef,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  const text = block.type === "text" ? block.text.trim() : "";
  return { text, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

/**
 * Runs a single LLM prompt through the configured provider, enforcing the daily
 * token budget (NFR-4) and recording provenance (NFR-2). Never throws — callers
 * (bulk jobs in particular, per NFR-5) get a typed failure instead so one asset's
 * LLM error doesn't abort the whole batch.
 */
export async function runSuggestionPrompt(prompt: string, ctx: ContextPackage, maxTokens = 1024): Promise<LlmCallResult> {
  const settings = await getEnrichmentSettings();

  if (settings.allowedEndpoints.length > 0 && !settings.allowedEndpoints.includes(settings.providerCode)) {
    return { ok: false, error: `Provider "${settings.providerCode}" is not in the approved endpoint allow-list` };
  }
  if (settings.dailyTokenBudget > 0 && settings.tokensUsedToday >= settings.dailyTokenBudget) {
    return { ok: false, error: "Daily AI token budget exceeded — queue paused until tomorrow (adjust in Enrichment Settings)" };
  }

  try {
    const { text, inputTokens, outputTokens } = await callAnthropic(prompt, settings, maxTokens);
    await recordTokenUsage(inputTokens + outputTokens);
    if (!text) return { ok: false, error: "LLM returned an empty response" };
    return {
      ok: true, text, modelRef: `${settings.providerCode}:${settings.modelRef}`,
      contextHash: hashPromptContext(prompt, ctx), contextManifest: buildContextManifest(ctx),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "LLM call failed" };
  }
}
