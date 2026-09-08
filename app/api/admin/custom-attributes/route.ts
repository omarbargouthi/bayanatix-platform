import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listAllCustomAttributeDefinitions, createCustomAttributeDefinition } from "@/lib/queries/custom-attributes";
import type { CustomAttributeAssetType, CustomAttributeDataType } from "@/lib/types";

const ASSET_TYPES: CustomAttributeAssetType[] = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES", "BUSINESS_GLOSSARIES"];
const DATA_TYPES: CustomAttributeDataType[] = ["TEXT", "LONGTEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM", "USER", "URL"];

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listAllCustomAttributeDefinitions());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { assetType, attrCode, attrName, dataType, enumValues, isRequired, displayOrder } = body;

  if (!ASSET_TYPES.includes(assetType)) return NextResponse.json({ error: "Invalid assetType" }, { status: 400 });
  if (!DATA_TYPES.includes(dataType)) return NextResponse.json({ error: "Invalid dataType" }, { status: 400 });
  if (!attrCode?.trim() || !attrName?.trim()) return NextResponse.json({ error: "attrCode and attrName required" }, { status: 400 });
  if (dataType === "ENUM" && (!Array.isArray(enumValues) || enumValues.length === 0)) {
    return NextResponse.json({ error: "enumValues required for ENUM fields" }, { status: 400 });
  }

  const attrDefId = await createCustomAttributeDefinition({
    assetType,
    attrCode: attrCode.trim().toUpperCase().replace(/\s+/g, "_"),
    attrName: attrName.trim(),
    dataType,
    enumValues: dataType === "ENUM" ? enumValues : null,
    isRequired: !!isRequired,
    displayOrder: displayOrder ?? 0,
    userId: session.userId,
  });
  return NextResponse.json({ attrDefId }, { status: 201 });
}
