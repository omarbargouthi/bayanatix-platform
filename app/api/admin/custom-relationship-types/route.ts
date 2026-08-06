import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRelationshipTypes, createRelationshipType, CORE_ASSET_TYPES, getCustomAssetTypes } from "@/lib/queries/custom-assets";
import { logCreate } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const includeDisabled = searchParams.get("all") === "true";
  const relTypes = await getRelationshipTypes(includeDisabled);
  return NextResponse.json(relTypes);
}

const VALID_CARDINALITY = ["M:N", "1:N", "N:1"];

async function validEndpointCodes(): Promise<Set<string>> {
  const customTypes = await getCustomAssetTypes(true);
  return new Set([...CORE_ASSET_TYPES, ...customTypes.map((t) => `CUSTOM:${t.typeCode}`)]);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    relCode, relNameText, nameArText, inverseNameText, inverseNameArText,
    fromEndpoints, toEndpoints, cardinalityCode, attributesSchema,
  } = body ?? {};

  if (!relCode || typeof relCode !== "string" || !/^[A-Z0-9_]+$/.test(relCode)) {
    return NextResponse.json({ error: "relCode must be uppercase letters/numbers/underscores" }, { status: 400 });
  }
  if (!relNameText?.trim()) return NextResponse.json({ error: "relNameText is required" }, { status: 400 });
  if (!VALID_CARDINALITY.includes(cardinalityCode)) return NextResponse.json({ error: "Invalid cardinalityCode" }, { status: 400 });
  if (!Array.isArray(fromEndpoints) || fromEndpoints.length === 0) return NextResponse.json({ error: "fromEndpoints must be a non-empty array" }, { status: 400 });
  if (!Array.isArray(toEndpoints) || toEndpoints.length === 0) return NextResponse.json({ error: "toEndpoints must be a non-empty array" }, { status: 400 });

  const valid = await validEndpointCodes();
  for (const code of [...fromEndpoints, ...toEndpoints]) {
    if (!valid.has(code)) return NextResponse.json({ error: `Unknown endpoint type: ${code}` }, { status: 400 });
  }

  let relTypeId: number;
  try {
    relTypeId = await createRelationshipType({
      relCode, relNameText: relNameText.trim(), nameArText: nameArText?.trim() || null,
      inverseNameText: inverseNameText?.trim() || null, inverseNameArText: inverseNameArText?.trim() || null,
      fromEndpoints, toEndpoints, cardinalityCode,
      attributesSchema: Array.isArray(attributesSchema) && attributesSchema.length > 0 ? attributesSchema : null,
      createdByUserId: session.userId,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create relationship type" }, { status: 400 });
  }

  await logCreate("CUSTOM_RELATIONSHIP_TYPE", relTypeId, session.userId, [
    { field: "rel_code", newVal: relCode },
    { field: "from_endpoints", newVal: JSON.stringify(fromEndpoints) },
    { field: "to_endpoints", newVal: JSON.stringify(toEndpoints) },
  ]);

  return NextResponse.json({ ok: true, relTypeId });
}
