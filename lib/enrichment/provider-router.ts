// LLM Provider Configuration — Provider Router (spec §1, §2.3, §4.3). Resolves which
// profile serves a capability (explicit route → its profile, else the default
// profile), health-checks it with a short TTL cache so a dead endpoint is detected
// within minutes without hammering it on every enrichment call, and falls back to
// the route's configured fallback profile (or degrades to "no provider available",
// which callers turn into a Tier-1-only degradation per NFR-5) when the primary is
// unhealthy or unconfigured.

import {
  getProfileById, getDefaultProfileId, resolveRouteForCapability, updateHealthStatus, getDecryptedCredential,
  type ProviderProfile, type Capability,
} from "../queries/llm-providers";
import { callProfile } from "./llm-adapters";
import type { ContextPackage } from "./context";

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000; // matches spec AC4's "within 5 minutes"

export type ResolvedProvider = { profile: ProviderProfile; apiKey: string | null; usedFallback: boolean };

async function checkHealth(profile: ProviderProfile): Promise<{ healthy: boolean; message: string }> {
  const fresh = profile.healthCheckedAt && Date.now() - new Date(profile.healthCheckedAt).getTime() < HEALTH_CACHE_TTL_MS;
  if (fresh) return { healthy: profile.healthStatus === "HEALTHY", message: profile.healthMessage ?? "" };

  try {
    const apiKey = await getDecryptedCredential(profile.profileId);
    await callProfile(profile, apiKey, "Reply with OK.", 5);
    await updateHealthStatus(profile.profileId, "HEALTHY", null);
    return { healthy: true, message: "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health check failed";
    await updateHealthStatus(profile.profileId, "UNHEALTHY", message);
    return { healthy: false, message };
  }
}

/**
 * Resolves the profile + decrypted credential to use for a capability, applying
 * fallback when the primary is disabled or fails its health check. Returns null when
 * nothing usable is configured (no default, no route, or route+fallback both dead) —
 * callers treat that as "LLM unavailable" (NFR-5: never blocks Tier-1 DQ).
 */
export async function resolveProviderForCapability(capability: Capability): Promise<ResolvedProvider | { error: string }> {
  const route = await resolveRouteForCapability(capability);
  const primaryId = route?.profileId ?? (await getDefaultProfileId());

  if (!primaryId) return { error: "No LLM provider is configured (no default profile and no capability route)" };

  const primary = await getProfileById(primaryId);
  if (primary && primary.isEnabled) {
    const health = await checkHealth(primary);
    if (health.healthy) {
      const apiKey = await getDecryptedCredential(primary.profileId);
      return { profile: primary, apiKey, usedFallback: false };
    }
  }

  const fallbackId = route?.fallbackProfileId;
  if (fallbackId) {
    const fallback = await getProfileById(fallbackId);
    if (fallback && fallback.isEnabled) {
      const health = await checkHealth(fallback);
      if (health.healthy) {
        const apiKey = await getDecryptedCredential(fallback.profileId);
        return { profile: fallback, apiKey, usedFallback: true };
      }
      return { error: `Primary and fallback providers are both unhealthy for ${capability} (${fallback.profileName}: ${health.message})` };
    }
  }

  return { error: primary ? `Provider "${primary.profileName}" is unhealthy or disabled and no fallback is configured for ${capability}` : "Configured provider profile no longer exists" };
}

/**
 * Spec §5: a profile's allow_sample_values_indicator can only RESTRICT sample-value
 * inclusion further than the column-classification-based gating already applied in
 * buildContextPackage() — never widen it. Must run before the context is formatted
 * into prompt text (sample values, once baked into a prompt string, can't be
 * retroactively redacted), so callers resolve this ahead of prompt construction
 * rather than relying on the later resolveProviderForCapability() call inside
 * runSuggestionPrompt to catch it in time.
 */
export async function applyProfileSampleValuePolicy(ctx: ContextPackage, capability: Capability): Promise<ContextPackage> {
  if (!ctx.sampleValuesAllowed || !ctx.sampleValues?.length) return ctx;

  const resolved = await resolveProviderForCapability(capability);
  if ("error" in resolved) return ctx; // runSuggestionPrompt will surface the same error shortly after

  if (!resolved.profile.allowSampleValues) {
    return { ...ctx, sampleValuesAllowed: false, sampleValues: null };
  }
  return ctx;
}
