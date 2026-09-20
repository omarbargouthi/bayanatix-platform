import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { suggestSitTypesForTerm } from "@/lib/queries/sit-classification";

// On-demand ranked candidates for "which SIT value fits this business term" —
// based on the term's own name/definition and the names of columns already
// linked to it. No persisted suggestion state; the steward applies one via the
// normal PUT /sit-types picker save.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const glossaryId = Number(params.id);
  if (!Number.isFinite(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  return NextResponse.json(await suggestSitTypesForTerm(glossaryId));
}
