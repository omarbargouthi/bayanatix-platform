import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { raiseLineageReview } from "@/lib/lineage/changes";

// POST — raise a review request against a lineage link that doesn't look right
// (scanned or manual). Anyone signed in can flag a link; the request is routed
// by the LINEAGE_REVIEW workflow, or straight to the target table's owners.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: { lineageId: number; reason: string; priority?: "HIGH" | "MEDIUM" | "LOW" } = await req.json();
  if (!Number.isFinite(body.lineageId)) return NextResponse.json({ error: "lineageId is required" }, { status: 400 });
  const priority = body.priority && ["HIGH", "MEDIUM", "LOW"].includes(body.priority) ? body.priority : "MEDIUM";

  const result = await raiseLineageReview(body.lineageId, session.userId, body.reason ?? "", priority);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
