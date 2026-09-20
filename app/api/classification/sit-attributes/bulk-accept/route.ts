import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkAcceptSitByIds } from "@/lib/queries/sit-classification";

// Checkbox-driven bulk accept — accepts exactly the selected (manually reviewed)
// rows regardless of confidence band, matching /api/classification/attributes/bulk-accept.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.attribute_ids)) return NextResponse.json({ error: "attribute_ids is required" }, { status: 400 });

  try {
    const accepted = await bulkAcceptSitByIds(body.attribute_ids.map(Number), session.userId);
    return NextResponse.json({ ok: true, accepted: accepted.length, acceptedIds: accepted });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
