import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getTypeAttributes, updateCustomAssetType, replaceTypeAttributes, getAttributeCodesWithData,
  type AttrFieldDef,
} from "@/lib/queries/custom-assets";
import { logUpdate } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { typeId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attributes = await getTypeAttributes(Number(params.typeId));
  return NextResponse.json(attributes);
}

const VALID_DATA_TYPES = ["TEXT", "LONGTEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM", "USER", "URL"];

export async function PATCH(req: Request, { params }: { params: { typeId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const typeId = Number(params.typeId);
  const body = await req.json();
  const { typeNameText, nameArText, descriptionText, iconCode, colorHex, isEnabled, attributes, confirmFieldDeletion } = body ?? {};

  if (attributes !== undefined) {
    const attrs: AttrFieldDef[] = Array.isArray(attributes) ? attributes : [];
    for (const a of attrs) {
      if (!a.attr_code || !a.attr_name_text || !VALID_DATA_TYPES.includes(a.data_type_code)) {
        return NextResponse.json({ error: `Invalid attribute definition: ${JSON.stringify(a)}` }, { status: 400 });
      }
    }
    const existing = await getTypeAttributes(typeId);
    const newCodes = new Set(attrs.map((a) => a.attr_code));
    const removedCodes = existing.filter((e) => !newCodes.has(e.attrCode)).map((e) => e.attrCode);
    if (removedCodes.length > 0 && !confirmFieldDeletion) {
      const withData = await getAttributeCodesWithData(typeId, removedCodes);
      if (withData.length > 0) {
        return NextResponse.json({
          error: "confirmation_required",
          message: `Fields ${withData.join(", ")} have data on existing instances. Resubmit with confirmFieldDeletion: true to proceed.`,
          fieldsWithData: withData,
        }, { status: 409 });
      }
    }
    await replaceTypeAttributes(typeId, attrs);
    await logUpdate("CUSTOM_ASSET_TYPE", typeId, session.userId, [
      { field: "attributes", oldVal: JSON.stringify(existing.map((e) => e.attrCode)), newVal: JSON.stringify(attrs.map((a) => a.attr_code)), force: true },
    ]);
  }

  await updateCustomAssetType(typeId, { typeNameText, nameArText, descriptionText, iconCode, colorHex, isEnabled });
  if (isEnabled !== undefined) {
    await logUpdate("CUSTOM_ASSET_TYPE", typeId, session.userId, [
      { field: "is_enabled_indicator", oldVal: String(!isEnabled), newVal: String(isEnabled), force: true },
    ]);
  }

  return NextResponse.json({ ok: true });
}
