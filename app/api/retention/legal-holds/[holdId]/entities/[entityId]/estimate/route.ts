import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHoldEntities } from "@/lib/queries/legal-holds";
import { estimateAffectedRowCount } from "@/lib/sample-data";

export async function GET(_req: Request, { params }: { params: { holdId: string; entityId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holdId = Number(params.holdId);
  const entityId = Number(params.entityId);
  if (isNaN(holdId) || isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const entities = await getHoldEntities(holdId);
  const entity = entities.find((e) => e.entityId === entityId);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await estimateAffectedRowCount(
    entityId,
    entity.conditions.map((c) => ({ attributeName: c.attributeName, valueText: c.valueText })),
  );
  return NextResponse.json(result);
}
