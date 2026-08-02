// AI Metadata Enrichment — Capability A bulk job runner (spec §2.1).
// Fire-and-forget + poll pattern, same shape as lib/crawler.ts's crawlDataSource().
// Batches one LLM call per table for its selected columns (§2.1 "batch efficiency").

import { sql } from "../db";
import { buildContextPackage, type AssetType } from "./context";
import { generateDescription, generateDescriptionsBatch, type Lang } from "./description-service";
import { createDescriptionSuggestion, supersedePendingSuggestions } from "../queries/enrichment-descriptions";
import {
  createEnrichmentJob, addEnrichmentJobLog, bumpEnrichmentJobProgress, finishEnrichmentJob, failEnrichmentJob,
} from "../queries/enrichment-jobs";

export type DescriptionJobScope = {
  assetType: AssetType;
  assetIds: number[];
  onlyEmpty: boolean;
  lang?: Lang;
};

async function resolveTargetIds(scope: DescriptionJobScope): Promise<number[]> {
  if (!scope.onlyEmpty) return scope.assetIds;
  if (scope.assetType === "DATA_ENTITIES") {
    const rows = await sql<{ id: number }[]>`
      SELECT entity_id AS id FROM bayanat.data_entities
      WHERE entity_id = ANY(${scope.assetIds}) AND (description_text IS NULL OR description_text = '')
    `;
    return rows.map((r) => r.id);
  }
  const rows = await sql<{ id: number }[]>`
    SELECT attribute_id AS id FROM bayanat.data_attributes
    WHERE attribute_id = ANY(${scope.assetIds}) AND (description_text IS NULL OR description_text = '')
  `;
  return rows.map((r) => r.id);
}

export async function runDescriptionJob(scope: DescriptionJobScope, userId: string): Promise<number> {
  const targetIds = await resolveTargetIds(scope);
  const jobId = await createEnrichmentJob("DESCRIPTION", scope, userId, targetIds.length);
  await addEnrichmentJobLog(jobId, "INFO", `Starting description generation for ${targetIds.length} asset(s)`);

  // Run in the background — caller (API route) doesn't await this.
  void (async () => {
    try {
      const lang = scope.lang ?? "en";
      if (scope.assetType === "DATA_ENTITIES") {
        for (const entityId of targetIds) {
          try {
            const ctx = await buildContextPackage("DATA_ENTITIES", entityId);
            if (!ctx) { await addEnrichmentJobLog(jobId, "WARN", `Entity ${entityId} not found — skipped`); await bumpEnrichmentJobProgress(jobId, 0, 1); continue; }
            const result = await generateDescription(ctx, lang);
            if (!result.ok) { await addEnrichmentJobLog(jobId, "ERROR", `Entity ${entityId} (${ctx.entityName}): ${result.error}`); await bumpEnrichmentJobProgress(jobId, 0, 1); continue; }
            await supersedePendingSuggestions("DATA_ENTITIES", entityId, "GENERATE");
            await createDescriptionSuggestion({
              assetType: "DATA_ENTITIES", assetId: entityId, modeCode: "GENERATE", suggestedText: result.text,
              rationale: { signals: result.rationaleSignals ?? [] }, originalText: ctx.existingDescription,
              jobId, modelRef: result.modelRef, contextHash: result.contextHash, contextManifest: result.contextManifest,
            });
            await bumpEnrichmentJobProgress(jobId, 1, 0);
          } catch (err) {
            await addEnrichmentJobLog(jobId, "ERROR", `Entity ${entityId}: ${err instanceof Error ? err.message : String(err)}`);
            await bumpEnrichmentJobProgress(jobId, 0, 1);
          }
        }
      } else {
        // Group selected attributes by table so each table costs exactly one LLM call.
        const rows = await sql<{ attributeId: number; entityId: number }[]>`
          SELECT attribute_id AS "attributeId", entity_id AS "entityId" FROM bayanat.data_attributes
          WHERE attribute_id = ANY(${targetIds})
        `;
        const byEntity = new Map<number, number[]>();
        for (const r of rows) byEntity.set(r.entityId, [...(byEntity.get(r.entityId) ?? []), r.attributeId]);

        for (const [entityId, attributeIds] of byEntity) {
          try {
            const tableCtx = await buildContextPackage("DATA_ENTITIES", entityId);
            if (!tableCtx) { await addEnrichmentJobLog(jobId, "WARN", `Table for entity ${entityId} not found — skipped ${attributeIds.length} column(s)`); await bumpEnrichmentJobProgress(jobId, 0, attributeIds.length); continue; }

            const columnContexts: { attributeId: number; ctx: Awaited<ReturnType<typeof buildContextPackage>> }[] = [];
            for (const attributeId of attributeIds) {
              const ctx = await buildContextPackage("DATA_ATTRIBUTES", attributeId);
              if (ctx) columnContexts.push({ attributeId, ctx });
            }
            if (columnContexts.length === 0) { await bumpEnrichmentJobProgress(jobId, 0, attributeIds.length); continue; }

            const batch = await generateDescriptionsBatch(
              tableCtx,
              columnContexts as { attributeId: number; ctx: NonNullable<Awaited<ReturnType<typeof buildContextPackage>>> }[],
              lang,
            );
            if (!batch.ok) {
              await addEnrichmentJobLog(jobId, "ERROR", `Table ${tableCtx.entityName}: ${batch.error}`);
              await bumpEnrichmentJobProgress(jobId, 0, columnContexts.length);
              continue;
            }

            for (const { attributeId, ctx } of columnContexts) {
              const entry = batch.results.get(attributeId);
              if (!entry) {
                await addEnrichmentJobLog(jobId, "WARN", `${tableCtx.entityName}.${ctx!.physicalName}: no description returned by the model — skipped`);
                await bumpEnrichmentJobProgress(jobId, 0, 1);
                continue;
              }
              await supersedePendingSuggestions("DATA_ATTRIBUTES", attributeId, "GENERATE");
              await createDescriptionSuggestion({
                assetType: "DATA_ATTRIBUTES", assetId: attributeId, modeCode: "GENERATE", suggestedText: entry.text,
                rationale: { signals: [`table: ${tableCtx.entityName}`, `column: ${ctx!.physicalName}`] }, originalText: ctx!.existingDescription,
                jobId, modelRef: batch.modelRef, contextHash: batch.contextHash, contextManifest: batch.contextManifest,
              });
              await bumpEnrichmentJobProgress(jobId, 1, 0);
            }
          } catch (err) {
            await addEnrichmentJobLog(jobId, "ERROR", `Table (entity ${entityId}): ${err instanceof Error ? err.message : String(err)}`);
            await bumpEnrichmentJobProgress(jobId, 0, attributeIds.length);
          }
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
