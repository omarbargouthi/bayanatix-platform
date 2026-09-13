import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkConfirmEntityCategories } from "@/lib/queries/catalog";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const entityIds = Array.isArray(body.entity_ids) ? body.entity_ids.map(Number) : [];
  if (entityIds.length === 0) return NextResponse.json({ error: "entity_ids is required" }, { status: 400 });

  const accepted = await bulkConfirmEntityCategories(entityIds, session.userId);
  return NextResponse.json({ ok: true, accepted: accepted.length, acceptedIds: accepted });
}
