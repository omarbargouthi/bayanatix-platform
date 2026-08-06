import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCustomAssetTypeByCode, getTypeAttributes, getInstance, updateInstance, validateAttributes,
  getLinksForAsset, getRelationshipTypesForAssetType,
} from "@/lib/queries/custom-assets";
import { logUpdate } from "@/lib/audit";

function canWrite(role: string) {
  return role === "ADMIN" || role === "STEWARD";
}

export async function GET(_req: Request, { params }: { params: { typeCode: string; assetId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) return NextResponse.json({ error: "Unknown type" }, { status: 404 });

  const assetId = Number(params.assetId);
  const instance = await getInstance(assetId);
  if (!instance || instance.typeId !== type.typeId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assetTypeCode = `CUSTOM:${type.typeCode}`;
  const [attributes, links, relationshipTypes] = await Promise.all([
    getTypeAttributes(type.typeId),
    getLinksForAsset(assetTypeCode, assetId),
    getRelationshipTypesForAssetType(assetTypeCode),
  ]);

  return NextResponse.json({ type, instance, attributes, links, relationshipTypes });
}

export async function PATCH(req: Request, { params }: { params: { typeCode: string; assetId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const assetId = Number(params.assetId);
  const existing = await getInstance(assetId);
  if (!existing || existing.typeId !== type.typeId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { assetNameText, nameArText, descriptionText, attributes, statusCode } = body ?? {};

  if (attributes !== undefined) {
    const errors = await validateAttributes(type.typeId, attributes, assetId);
    if (errors.length > 0) return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
  }

  await updateInstance(assetId, { assetNameText, nameArText, descriptionText, attributes, statusCode });

  await logUpdate(`CUSTOM:${type.typeCode}`, assetId, session.userId, [
    { field: "asset_name_text", oldVal: existing.assetNameText, newVal: assetNameText ?? existing.assetNameText },
    { field: "attributes", oldVal: JSON.stringify(existing.attributes), newVal: JSON.stringify(attributes ?? existing.attributes) },
    { field: "status_code", oldVal: existing.statusCode, newVal: statusCode ?? existing.statusCode },
  ]);

  return NextResponse.json({ ok: true });
}
