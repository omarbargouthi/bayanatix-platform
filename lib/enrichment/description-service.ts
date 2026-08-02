// AI Metadata Enrichment — Capability A: Description suggestion (spec §2).
// Pure prompt-construction + LLM orchestration. Writing suggestion rows / accepting
// them into official description_text is lib/queries/enrichment-descriptions.ts.

import type { ContextPackage } from "./context";
import { runSuggestionPrompt, type LlmCallResult } from "./suggestion-service";
import { applyProfileSampleValuePolicy } from "./provider-router";

export type Lang = "en" | "ar";

const LANG_NAME: Record<Lang, string> = { en: "English", ar: "Arabic" };

function formatContext(ctx: ContextPackage): string {
  const lines: string[] = [];
  if (ctx.assetType === "DATA_ENTITIES") {
    lines.push(`Asset: table "${ctx.schemaName ? ctx.schemaName + "." : ""}${ctx.entityName}"`);
    lines.push(`Table category: ${ctx.tableCategory ?? "unknown"}${ctx.isView ? " (view)" : ""}`);
  } else {
    lines.push(`Asset: column "${ctx.physicalName}" on table "${ctx.schemaName ? ctx.schemaName + "." : ""}${ctx.entityName}" (category: ${ctx.tableCategory ?? "unknown"})`);
    if (ctx.friendlyName) lines.push(`Friendly name: ${ctx.friendlyName}`);
    lines.push(`Data type: ${ctx.dataType}${ctx.isNullable ? "" : ", NOT NULL"}`);
    if (ctx.isPrimaryKey) lines.push("Role: primary key");
    if (ctx.assetClass) lines.push(`Asset class: ${ctx.assetClass}`);
  }
  if (ctx.rowCountEstimate != null) lines.push(`Row count: ~${ctx.rowCountEstimate.toLocaleString()}`);

  if (ctx.outboundFks.length) {
    lines.push(`Foreign keys: ${ctx.outboundFks.map((f) => `${f.columnName} -> ${f.refTableName}.${f.refColumnName}`).join(", ")}`);
  }
  if (ctx.inboundFks.length) {
    const uniqTables = [...new Set(ctx.inboundFks.map((f) => f.fromTableName))];
    lines.push(`Referenced by: ${uniqTables.join(", ")}`);
  }
  if (ctx.siblingColumns.length) {
    lines.push(`Sibling columns: ${ctx.siblingColumns.slice(0, 20).map((c) => c.name).join(", ")}`);
  }
  if (ctx.profiling) {
    const p = ctx.profiling;
    const bits: string[] = [];
    if (p.nullPct != null) bits.push(`${Number(p.nullPct).toFixed(1)}% null`);
    if (p.distinctCount != null && p.rowCount) bits.push(`${((Number(p.distinctCount) / Number(p.rowCount)) * 100).toFixed(1)}% unique`);
    if (p.minValue != null || p.maxValue != null) bits.push(`range [${p.minValue ?? "?"}, ${p.maxValue ?? "?"}]`);
    if (bits.length) lines.push(`Profiling: ${bits.join(", ")}`);
    if (ctx.sampleValues?.length) lines.push(`Sample values: ${ctx.sampleValues.slice(0, 8).join(", ")}`);
  }
  if (ctx.glossaryMatch) {
    lines.push(`Business glossary term: "${ctx.glossaryMatch.termName}" — ${ctx.glossaryMatch.definition ?? "(no definition)"}`);
    if (ctx.glossaryMatch.formatText) lines.push(`Expected format: ${ctx.glossaryMatch.formatText}`);
  }
  return lines.join("\n");
}

export type GenerateResult = LlmCallResult & { rationaleSignals?: string[] };

function rationaleSignalsFor(ctx: ContextPackage): string[] {
  const signals: string[] = [`name: ${ctx.physicalName}`];
  if (ctx.tableCategory) signals.push(`table category: ${ctx.tableCategory}`);
  if (ctx.outboundFks.length) signals.push(`FK to ${ctx.outboundFks[0].refTableName}`);
  if (ctx.profiling?.distinctCount != null && ctx.profiling.rowCount) {
    signals.push(`${((Number(ctx.profiling.distinctCount) / Number(ctx.profiling.rowCount)) * 100).toFixed(0)}% unique`);
  }
  if (ctx.glossaryMatch) signals.push(`glossary term '${ctx.glossaryMatch.termName}'`);
  return signals;
}

export async function generateDescription(ctx: ContextPackage, lang: Lang = "en"): Promise<GenerateResult> {
  // Must resolve the profile's sample-value policy BEFORE formatting the prompt —
  // once sample values are baked into prompt text there's no redacting them (spec §5, AC6).
  const gatedCtx = await applyProfileSampleValuePolicy(ctx, "DESCRIBE");
  const prompt = [
    `You are a data governance assistant writing a concise, business-friendly description for a data catalog.`,
    `Write ONLY in ${LANG_NAME[lang]}. Base the description strictly on the metadata below — never invent facts, table relationships, or values that are not present in it.`,
    `Keep it to 1-2 sentences. Do not restate the raw column name or data type unless it clarifies meaning. Return ONLY the description text, with no preamble, quotes, or labels.`,
    ``,
    formatContext(gatedCtx),
  ].join("\n");

  const result = await runSuggestionPrompt(prompt, gatedCtx, "DESCRIBE", 300);
  return result.ok ? { ...result, rationaleSignals: rationaleSignalsFor(ctx) } : result;
}

/**
 * Batch generation for multiple columns of the same table in a single LLM call
 * (spec §2.1: "one LLM call per table for its selected columns"). Returns a map
 * keyed by attributeId; entries missing from the model's response are reported
 * as per-row failures by the caller (bulk job runner), not a total job failure.
 */
export async function generateDescriptionsBatch(
  tableCtx: ContextPackage,
  columnContexts: { attributeId: number; ctx: ContextPackage }[],
  lang: Lang = "en",
): Promise<{ ok: true; results: Map<number, { text: string }>; modelRef: string; contextHash: string; contextManifest: Record<string, unknown> } | { ok: false; error: string }> {
  const gatedColumnContexts = await Promise.all(
    columnContexts.map(async ({ attributeId, ctx }) => ({ attributeId, ctx: await applyProfileSampleValuePolicy(ctx, "DESCRIBE") })),
  );
  const columnBlocks = gatedColumnContexts.map(({ attributeId, ctx }) => `### attribute_id=${attributeId}\n${formatContext(ctx)}`).join("\n\n");

  const prompt = [
    `You are a data governance assistant writing concise, business-friendly descriptions for a data catalog.`,
    `Write ONLY in ${LANG_NAME[lang]}. Base every description strictly on that column's metadata — never invent facts.`,
    `Table context (shared by every column below): ${formatContext(tableCtx)}`,
    ``,
    `For each of the following columns, write a 1-2 sentence description. Return ONLY a JSON object mapping each attribute_id (as a string) to its description string — no other text, no markdown fences.`,
    ``,
    columnBlocks,
  ].join("\n");

  const result = await runSuggestionPrompt(prompt, tableCtx, "DESCRIBE", 300 * Math.max(1, columnContexts.length));
  if (!result.ok) return result;

  let parsed: Record<string, string>;
  try {
    const jsonText = result.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Could not parse batch response as JSON" };
  }

  const results = new Map<number, { text: string }>();
  for (const { attributeId } of columnContexts) {
    const text = parsed[String(attributeId)];
    if (text?.trim()) results.set(attributeId, { text: text.trim() });
  }
  return { ok: true, results, modelRef: result.modelRef, contextHash: result.contextHash, contextManifest: result.contextManifest };
}

const REPHRASE_STYLES = [
  { key: "clearer", instruction: "clearer, simpler wording while preserving all facts" },
  { key: "business", instruction: "a more formal business tone suitable for an executive glossary" },
  { key: "concise", instruction: "the most concise possible version that keeps every fact" },
] as const;

export type RephraseResult =
  | { ok: true; variants: string[]; modelRef: string; contextHash: string; contextManifest: Record<string, unknown> }
  | { ok: false; error: string };

export async function rephraseDescription(ctx: ContextPackage, currentText: string, lang: Lang = "en"): Promise<RephraseResult> {
  const gatedCtx = await applyProfileSampleValuePolicy(ctx, "REPHRASE");
  const prompt = [
    `You are a data governance assistant. Rewrite the following data catalog description in ${LANG_NAME[lang]} in three different styles, WITHOUT changing its meaning or adding any fact not already present in it.`,
    `Style 1: ${REPHRASE_STYLES[0].instruction}.`,
    `Style 2: ${REPHRASE_STYLES[1].instruction}.`,
    `Style 3: ${REPHRASE_STYLES[2].instruction}.`,
    `Grounding context (for terminology only — do not add facts beyond this + the current description): ${formatContext(gatedCtx)}`,
    ``,
    `Current description: "${currentText}"`,
    ``,
    `Return ONLY a JSON array of exactly 3 strings, no markdown fences, no other text.`,
  ].join("\n");

  const result = await runSuggestionPrompt(prompt, gatedCtx, "REPHRASE", 600);
  if (!result.ok) return result;

  try {
    const jsonText = result.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const variants = JSON.parse(jsonText);
    if (!Array.isArray(variants) || variants.some((v) => typeof v !== "string")) throw new Error("not a string array");
    return {
      ok: true, variants: variants.slice(0, 3),
      modelRef: result.modelRef, contextHash: result.contextHash, contextManifest: result.contextManifest,
    };
  } catch {
    return { ok: false, error: "Could not parse rephrase response as a 3-variant JSON array" };
  }
}
