// AI Metadata Enrichment — SuggestionService (spec §1): the single internal service
// LLM calls are abstracted behind. As of the LLM Provider Configuration feature, the
// actual model/endpoint/credential is resolved per-capability by the Provider Router
// (lib/enrichment/provider-router.ts) rather than hardcoded here — this module now
// owns only prompt-agnostic concerns: DQ-suggestion thresholds/freshness (still
// global, not per-provider), and prompt/response provenance (context hash + manifest,
// never the withheld sensitive values themselves) for audit (NFR-2).

import crypto from "crypto";
import { sql } from "../db";
import type { ContextPackage } from "./context";
import { resolveProviderForCapability } from "./provider-router";
import { callProfile } from "./llm-adapters";
import { logUsage, type Capability } from "../queries/llm-providers";

export type { Capability } from "../queries/llm-providers";

export type EnrichmentSettings = {
  batchSize: number;
  nullCheckBufferPct: number;
  nullCheckSoftThresholdPct: number;
  uniquenessBufferPct: number;
  profileFreshnessDays: number;
  defaultLanguageCode: string;
};

type SettingsRow = {
  batchSize: number;
  nullCheckBufferPct: string; nullCheckSoftThresholdPct: string; uniquenessBufferPct: string;
  profileFreshnessDays: number; defaultLanguageCode: string;
};

export async function getEnrichmentSettings(): Promise<EnrichmentSettings> {
  const [row] = await sql<SettingsRow[]>`
    SELECT batch_size AS "batchSize",
           null_check_buffer_pct AS "nullCheckBufferPct", null_check_soft_threshold_pct AS "nullCheckSoftThresholdPct",
           uniqueness_buffer_pct AS "uniquenessBufferPct", profile_freshness_days AS "profileFreshnessDays",
           default_language_code AS "defaultLanguageCode"
    FROM bayanat.enrichment_settings WHERE settings_id = 1
  `;
  return {
    batchSize: row.batchSize, nullCheckBufferPct: Number(row.nullCheckBufferPct),
    nullCheckSoftThresholdPct: Number(row.nullCheckSoftThresholdPct), uniquenessBufferPct: Number(row.uniquenessBufferPct),
    profileFreshnessDays: row.profileFreshnessDays, defaultLanguageCode: row.defaultLanguageCode,
  };
}

export async function updateEnrichmentSettings(patch: {
  batchSize?: number; nullCheckBufferPct?: number; nullCheckSoftThresholdPct?: number; uniquenessBufferPct?: number;
  profileFreshnessDays?: number; defaultLanguageCode?: string;
}): Promise<void> {
  await sql`
    UPDATE bayanat.enrichment_settings SET
      batch_size                     = coalesce(${patch.batchSize ?? null}, batch_size),
      null_check_buffer_pct          = coalesce(${patch.nullCheckBufferPct ?? null}, null_check_buffer_pct),
      null_check_soft_threshold_pct  = coalesce(${patch.nullCheckSoftThresholdPct ?? null}, null_check_soft_threshold_pct),
      uniqueness_buffer_pct          = coalesce(${patch.uniquenessBufferPct ?? null}, uniqueness_buffer_pct),
      profile_freshness_days         = coalesce(${patch.profileFreshnessDays ?? null}, profile_freshness_days),
      default_language_code          = coalesce(${patch.defaultLanguageCode ?? null}, default_language_code)
    WHERE settings_id = 1
  `;
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
          : "provider profile disallows sample values (allow_sample_values_indicator=false)",
  };
}

export function hashPromptContext(prompt: string, ctx: ContextPackage): string {
  return crypto.createHash("sha256").update(`${ctx.assetType}:${ctx.assetId}:${prompt}`).digest("hex");
}

// ── LLM transport ────────────────────────────────────────────────────────────────

export type LlmCallResult =
  | { ok: true; text: string; modelRef: string; contextHash: string; contextManifest: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Runs a single LLM prompt for a capability through the Provider Router: resolves
 * the active/fallback profile, enforces that profile's own daily token budget, and
 * records provenance (NFR-2) + usage (for the admin usage dashboard). Never throws —
 * callers (bulk jobs in particular, per NFR-5) get a typed failure instead so one
 * asset's LLM error doesn't abort the whole batch.
 */
export async function runSuggestionPrompt(prompt: string, ctx: ContextPackage, capability: Capability, maxTokens = 1024): Promise<LlmCallResult> {
  const resolved = await resolveProviderForCapability(capability);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { profile, apiKey } = resolved;

  if (profile.dailyTokenBudget != null && profile.dailyTokenBudget > 0) {
    const { getTokensUsedToday } = await import("../queries/llm-providers");
    const usedToday = await getTokensUsedToday(profile.profileId);
    if (usedToday >= profile.dailyTokenBudget) {
      return { ok: false, error: `Daily token budget exceeded for provider "${profile.profileName}" — queue paused until tomorrow` };
    }
  }

  try {
    const { text, inputTokens, outputTokens } = await callProfile(profile, apiKey, prompt, maxTokens);
    await logUsage(profile.profileId, capability, inputTokens, outputTokens, !!text);
    if (!text) return { ok: false, error: "LLM returned an empty response" };
    return {
      ok: true, text, modelRef: `${profile.profileName}:${profile.modelName}`,
      contextHash: hashPromptContext(prompt, ctx), contextManifest: buildContextManifest(ctx),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    await logUsage(profile.profileId, capability, 0, 0, false, message);
    return { ok: false, error: message };
  }
}
