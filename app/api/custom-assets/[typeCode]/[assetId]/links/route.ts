import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCustomAssetTypeByCode, getInstance, getRelationshipTypeByCode, validateLinkEndpoints, createLink,
} from "@/lib/queries/custom-assets";
import { logCreate } from "@/lib/audit";

function canWrite(role: string) {
  return role === "ADMIN" || role === "STEWARD";
}

export async function POST(req: Request, { params }: { params: { typeCode: string; assetId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = await getCustomAssetTypeByCode(params.typeCode.toUpperCase());
  if (!type) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const assetId = Number(params.assetId);
  const instance = await getInstance(assetId);
  if (!instance || instance.typeId !== type.typeId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { relCode, direction, otherAssetTypeCode, otherAssetId, attributes, validFromDate, validToDate } = body ?? {};

  const relType = await getRelationshipTypeByCode(relCode);
  if (!relType) return NextResponse.json({ error: "Unknown relationship type" }, { status: 404 });
  if (!otherAssetTypeCode || !otherAssetId) return NextResponse.json({ error: "otherAssetTypeCode and otherAssetId are required" }, { status: 400 });

  const thisAssetType = `CUSTOM:${type.typeCode}`;
  const [fromType, fromId, toType, toId] = direction === "OUT"
    ? [thisAssetType, assetId, otherAssetTypeCode, Number(otherAssetId)]
    : [otherAssetTypeCode, Number(otherAssetId), thisAssetType, assetId];

  const validation = validateLinkEndpoints(relType, fromType, toType);
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });

  const linkId = await createLink({
    relTypeId: relType.relTypeId, fromAssetTypeCode: fromType, fromAssetId: fromId,
    toAssetTypeCode: toType, toAssetId: toId, attributes: attributes && typeof attributes === "object" ? attributes : {},
    validFromDate: validFromDate || null, validToDate: validToDate || null, createdByUserId: session.userId,
  });

  if (linkId) {
    await logCreate("CUSTOM_ASSET_LINK", linkId, session.userId, [
      { field: "rel_code", newVal: relCode },
      { field: "from", newVal: `${fromType}:${fromId}` },
      { field: "to", newVal: `${toType}:${toId}` },
    ]);
  }

  return NextResponse.json({ ok: true, linkId });
}
