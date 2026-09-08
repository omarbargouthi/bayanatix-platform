import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomAttributeValues, saveCustomAttributeValues } from "@/lib/queries/custom-attributes";
import type { CustomAttributeAssetType } from "@/lib/types";

const ASSET_TYPES: CustomAttributeAssetType[] = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES", "BUSINESS_GLOSSARIES"];

type Params = { params: { assetType: string; assetId: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ASSET_TYPES.includes(params.assetType as CustomAttributeAssetType)) {
    return NextResponse.json({ error: "Invalid assetType" }, { status: 400 });
  }
  const result = await getCustomAttributeValues(params.assetType as CustomAttributeAssetType, Number(params.assetId));
  return NextResponse.json(result);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ASSET_TYPES.includes(params.assetType as CustomAttributeAssetType)) {
    return NextResponse.json({ error: "Invalid assetType" }, { status: 400 });
  }
  const { values }: { values: Record<string, string | number | boolean | null> } = await req.json();
  await saveCustomAttributeValues(params.assetType as CustomAttributeAssetType, Number(params.assetId), values ?? {}, session.userId);
  return NextResponse.json({ ok: true });
}
