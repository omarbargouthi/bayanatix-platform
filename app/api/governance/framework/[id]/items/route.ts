import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { listRoadmapItems, createRoadmapItem, isRoadmapDoc, RoadmapItemError } from "@/lib/queries/gov-roadmap-items";

// The milestones and deliverables of a roadmap document.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ items: await listRoadmapItems(Number(params.id)) });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const docId = Number(params.id);
  if (!(await isRoadmapDoc(docId))) return NextResponse.json({ error: "Not a roadmap." }, { status: 404 });
  try {
    const itemId = await createRoadmapItem(docId, await req.json(), session.userId);
    return NextResponse.json({ itemId }, { status: 201 });
  } catch (e) {
    if (e instanceof RoadmapItemError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
