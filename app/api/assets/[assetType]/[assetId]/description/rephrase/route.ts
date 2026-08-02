import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { parseAssetType, buildContextPackage } from "@/lib/enrichment/context";
import { rephraseDescription, type Lang } from "@/lib/enrichment/description-service";
import { createDescriptionSuggestion, supersedePendingSuggestions } from "@/lib/queries/enrichment-descriptions";
import { getEnrichmentSettings } from "@/lib/enrichment/suggestion-service";

export async function POST(req: Request, { params }: { params: { assetType: string; assetId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assetType = parseAssetType(params.assetType);
  if (!assetType) return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const settings = await getEnrichmentSettings();
  const lang = (body.lang as Lang) ?? (settings.defaultLanguageCode as Lang) ?? "en";

  const ctx = await buildContextPackage(assetType, assetId);
  if (!ctx) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!ctx.existingDescription?.trim()) return NextResponse.json({ error: "Asset has no existing description to rephrase" }, { status: 400 });

  const result = await rephraseDescription(ctx, ctx.existingDescription, lang);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  await supersedePendingSuggestions(assetType, assetId, "REPHRASE");
  const suggestionIds: number[] = [];
  for (let i = 0; i < result.variants.length; i++) {
    const id = await createDescriptionSuggestion({
      assetType, assetId, modeCode: "REPHRASE", suggestedText: result.variants[i], variantNumber: i + 1,
      rationale: { basedOn: "existing description", variant: i + 1 }, originalText: ctx.existingDescription,
      modelRef: result.modelRef, contextHash: result.contextHash, contextManifest: result.contextManifest,
    });
    suggestionIds.push(id);
  }

  return NextResponse.json({
    variants: result.variants.map((text, i) => ({ suggestionId: suggestionIds[i], text, variantNumber: i + 1 })),
    originalText: ctx.existingDescription, modelRef: result.modelRef,
  }, { status: 201 });
}
