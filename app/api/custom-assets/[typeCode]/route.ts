import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCustomAssetTypeByCode, getTypeAttributes, getInstances, createInstance, validateAttributes,
} from "@/lib/queries/custom-assets";
import { logCreate } from "@/lib/audit";

function canWrite(role: string) {
  return role === "ADMIN" || role === "STEWARD";
}

export async function GET(req: Request, { params }: { params: { typeCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) return NextResponse.json({ error: "Unknown type" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = 50;

  const [attributes, { rows, total }] = await Promise.all([
    getTypeAttributes(type.typeId),
    getInstances(type.typeId, { search, limit, offset: (page - 1) * limit }),
  ]);

  return NextResponse.json({ type, attributes, instances: rows, total });
}

export async function POST(req: Request, { params }: { params: { typeCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  if (!type.isEnabled) return NextResponse.json({ error: "This type is disabled — new instances can't be created." }, { status: 400 });

  const body = await req.json();
  const { assetNameText, nameArText, descriptionText, attributes } = body ?? {};
  if (!assetNameText?.trim()) return NextResponse.json({ error: "assetNameText is required" }, { status: 400 });

  const attrs = attributes && typeof attributes === "object" ? attributes : {};
  const errors = await validateAttributes(type.typeId, attrs);
  if (errors.length > 0) return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });

  let assetId: number;
  try {
    assetId = await createInstance({
      typeId: type.typeId, assetNameText: assetNameText.trim(), nameArText: nameArText?.trim() || null,
      descriptionText: descriptionText?.trim() || null, attributes: attrs, createdByUserId: session.userId,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create instance" }, { status: 400 });
  }

  await logCreate(`CUSTOM:${type.typeCode}`, assetId, session.userId, [
    { field: "asset_name_text", newVal: assetNameText },
    { field: "attributes", newVal: JSON.stringify(attrs) },
  ]);

  return NextResponse.json({ ok: true, assetId });
}
