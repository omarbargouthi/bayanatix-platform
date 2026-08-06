import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateRelationshipType } from "@/lib/queries/custom-assets";
import { logUpdate } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: { relTypeId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const relTypeId = Number(params.relTypeId);
  const body = await req.json();
  const {
    relNameText, nameArText, inverseNameText, inverseNameArText,
    fromEndpoints, toEndpoints, cardinalityCode, attributesSchema, isEnabled,
  } = body ?? {};

  await updateRelationshipType(relTypeId, {
    relNameText, nameArText, inverseNameText, inverseNameArText,
    fromEndpoints, toEndpoints, cardinalityCode, attributesSchema, isEnabled,
  });

  await logUpdate("CUSTOM_RELATIONSHIP_TYPE", relTypeId, session.userId, [
    { field: "updated", oldVal: null, newVal: JSON.stringify(body), force: true },
  ]);

  return NextResponse.json({ ok: true });
}
