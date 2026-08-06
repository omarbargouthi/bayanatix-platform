import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomAssetTypes, createCustomAssetType, type AttrFieldDef } from "@/lib/queries/custom-assets";
import { logCreate } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const includeDisabled = searchParams.get("all") === "true";
  const types = await getCustomAssetTypes(includeDisabled);
  return NextResponse.json(types);
}

const VALID_DATA_TYPES = ["TEXT", "LONGTEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM", "USER", "URL"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { typeCode, typeNameText, nameArText, descriptionText, iconCode, colorHex, attributes } = body ?? {};

  if (!typeCode || typeof typeCode !== "string" || !/^[A-Z0-9_]+$/.test(typeCode)) {
    return NextResponse.json({ error: "typeCode must be uppercase letters/numbers/underscores" }, { status: 400 });
  }
  if (!typeNameText?.trim()) return NextResponse.json({ error: "typeNameText is required" }, { status: 400 });

  const attrs: AttrFieldDef[] = Array.isArray(attributes) ? attributes : [];
  for (const a of attrs) {
    if (!a.attr_code || !a.attr_name_text || !VALID_DATA_TYPES.includes(a.data_type_code)) {
      return NextResponse.json({ error: `Invalid attribute definition: ${JSON.stringify(a)}` }, { status: 400 });
    }
  }

  let typeId: number;
  try {
    typeId = await createCustomAssetType({
      typeCode, typeNameText: typeNameText.trim(), nameArText: nameArText?.trim() || null,
      descriptionText: descriptionText?.trim() || null, iconCode: iconCode || null, colorHex: colorHex || null,
      createdByUserId: session.userId, attributes: attrs,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create type" }, { status: 400 });
  }

  await logCreate("CUSTOM_ASSET_TYPE", typeId, session.userId, [
    { field: "type_code", newVal: typeCode },
    { field: "type_name_text", newVal: typeNameText },
    { field: "attributes", newVal: JSON.stringify(attrs) },
  ]);

  return NextResponse.json({ ok: true, typeId });
}
