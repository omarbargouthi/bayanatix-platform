// AI Metadata Enrichment — Capability B orchestration (spec §3). Assembles the extra
// evidence Tier 1 needs beyond the base ContextPackage (referenced-lookup domain
// values, profile freshness), runs Tier 1 (always) + Tier 2 (BUSINESS columns only,
// best-effort — an LLM failure here never blocks the deterministic Tier 1 rules,
// per NFR-5), and persists suggestions.

import { sql } from "../db";
import { buildContextPackage, type ContextPackage, type AssetType } from "./context";
import { suggestTier1ColumnRules, suggestTier1TableRules, type DomainEvidence } from "./dq-suggester";
import { suggestTier2Rules } from "./dq-suggester-llm";
import { getEnrichmentSettings } from "./suggestion-service";
import { createDqRuleSuggestion } from "../queries/enrichment-dq";
import {
  createEnrichmentJob, addEnrichmentJobLog, bumpEnrichmentJobProgress, finishEnrichmentJob, failEnrichmentJob,
} from "../queries/enrichment-jobs";

async function loadDomainEvidence(ctx: ContextPackage): Promise<DomainEvidence> {
  if (!ctx.isForeignKey || ctx.outboundFks.length === 0) return null;
  const fk = ctx.outboundFks[0];

  const [refEntity] = await sql<{ entityId: number; category: string | null }[]>`
    SELECT e.entity_id AS "entityId", e.entity_category_code AS category
    FROM bayanat.data_entities e WHERE e.entity_name_text = ${fk.refTableName}
  `;
  if (!refEntity || refEntity.category !== "REFERENCE") return null;

  const [refAttr] = await sql<{ attributeId: number }[]>`
    SELECT attribute_id AS "attributeId" FROM bayanat.data_attributes
    WHERE entity_id = ${refEntity.entityId} AND physical_name_text = ${fk.refColumnName}
  `;
  if (!refAttr) return null;

  // Prefer the referenced column's own profiling sample; fall back to a live distinct query.
  const [prof] = await sql<{ topValues: { value: string }[] | string | null; distinctCount: number | null }[]>`
    SELECT ap.top_values AS "topValues", ap.distinct_count AS "distinctCount"
    FROM bayanat.attribute_profile ap
    JOIN bayanat.entity_profile ep ON ep.profile_id = ap.profile_id
    WHERE ap.attribute_id = ${refAttr.attributeId}
    ORDER BY ep.profiled_at DESC LIMIT 1
  `;
  if (!prof || prof.distinctCount == null || Number(prof.distinctCount) > 20) return null;

  let topValues = prof.topValues;
  if (typeof topValues === "string") { try { topValues = JSON.parse(topValues); } catch { topValues = null; } }
  if (!Array.isArray(topValues) || topValues.length === 0) return null;

  return { refTable: fk.refTableName, refColumn: fk.refColumnName, values: topValues.map((v) => v.value) };
}

export type ColumnDqSuggestResult = {
  attributeId: number;
  created: number;
  degradedProfile: boolean;
  tier2Error: string | null;
};

export async function suggestDqRulesForColumn(attributeId: number, jobId?: number | null): Promise<ColumnDqSuggestResult | null> {
  const ctx = await buildContextPackage("DATA_ATTRIBUTES", attributeId);
  if (!ctx) return null;

  const settings = await getEnrichmentSettings();
  const profileAgeDays = ctx.profiling?.profileAgeDays ?? Infinity;
  const degradedProfile = profileAgeDays > settings.profileFreshnessDays;
  // Stale profiling data is worse than none (thresholds derived from it would be
  // wrong) — treat it as structure-only, same as if no profile existed (spec §3.3 AC5).
  const tier1Ctx: ContextPackage = degradedProfile ? { ...ctx, profiling: null } : ctx;

  const domain = await loadDomainEvidence(ctx);
  const drafts = suggestTier1ColumnRules(tier1Ctx, {
    nullCheckBufferPct: settings.nullCheckBufferPct,
    nullCheckSoftThresholdPct: settings.nullCheckSoftThresholdPct,
    uniquenessBufferPct: settings.uniquenessBufferPct,
  }, domain);

  let tier2Error: string | null = null;
  if (ctx.assetClass === "BUSINESS") {
    const tier2 = await suggestTier2Rules(ctx);
    if (tier2.ok) drafts.push(...tier2.drafts);
    else tier2Error = tier2.error;
  }

  let created = 0;
  for (const draft of drafts) {
    await createDqRuleSuggestion({
      assetType: "DATA_ATTRIBUTES", assetId: attributeId, draft, jobId,
      modelRef: draft.provenanceCode === "LLM" ? "ANTHROPIC:tier2" : "DETERMINISTIC:tier1",
      contextHash: "n/a", contextManifest: { degradedProfile },
    });
    created++;
  }
  return { attributeId, created, degradedProfile, tier2Error };
}

export async function suggestDqRulesForTable(entityId: number, jobId?: number | null): Promise<number> {
  const ctx = await buildContextPackage("DATA_ENTITIES", entityId);
  if (!ctx) return 0;
  const drafts = suggestTier1TableRules(ctx);
  for (const draft of drafts) {
    await createDqRuleSuggestion({
      assetType: "DATA_ENTITIES", assetId: entityId, draft, jobId,
      modelRef: "DETERMINISTIC:tier1", contextHash: "n/a", contextManifest: {},
    });
  }
  return drafts.length;
}

export type DqJobScope = { assetType: AssetType; assetIds: number[] };

export async function runDqSuggestionJob(scope: DqJobScope, userId: string): Promise<number> {
  const jobId = await createEnrichmentJob("DQ_RULE", scope, userId, scope.assetIds.length);
  await addEnrichmentJobLog(jobId, "INFO", `Starting DQ rule suggestion for ${scope.assetIds.length} asset(s)`);

  void (async () => {
    try {
      for (const assetId of scope.assetIds) {
        try {
          if (scope.assetType === "DATA_ATTRIBUTES") {
            const result = await suggestDqRulesForColumn(assetId, jobId);
            if (!result) { await addEnrichmentJobLog(jobId, "WARN", `Attribute ${assetId} not found — skipped`); await bumpEnrichmentJobProgress(jobId, 0, 1); continue; }
            if (result.degradedProfile) await addEnrichmentJobLog(jobId, "WARN", `Attribute ${assetId}: profile stale/absent — structure-only suggestions`);
            if (result.tier2Error) await addEnrichmentJobLog(jobId, "WARN", `Attribute ${assetId}: Tier 2 (LLM) skipped — ${result.tier2Error}`);
            await addEnrichmentJobLog(jobId, "INFO", `Attribute ${assetId}: ${result.created} rule draft(s) suggested`);
            await bumpEnrichmentJobProgress(jobId, 1, 0);
          } else {
            const count = await suggestDqRulesForTable(assetId, jobId);
            await addEnrichmentJobLog(jobId, "INFO", `Entity ${assetId}: ${count} rule draft(s) suggested`);
            await bumpEnrichmentJobProgress(jobId, 1, 0);
          }
        } catch (err) {
          await addEnrichmentJobLog(jobId, "ERROR", `Asset ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
          await bumpEnrichmentJobProgress(jobId, 0, 1);
        }
      }
      await finishEnrichmentJob(jobId);
      await addEnrichmentJobLog(jobId, "INFO", "Job complete");
    } catch (err) {
      await failEnrichmentJob(jobId, err instanceof Error ? err.message : String(err));
    }
  })();

  return jobId;
}
