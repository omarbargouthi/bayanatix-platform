import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllCategoriesManifest } from "@/lib/queries/retention";

// All-categories bundle — the actual "retention automation report" a DBA/ops
// team downloads once to drive an external purge/archive job across every
// category that has a schedule defined. See the per-category download route's
// comment for the ADMIN/OFFICER gate rationale (host/port + legal hold
// references) and lib/queries/retention.ts's "Purge configuration manifest"
// header comment for the read-only, no-credentials design boundary.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bundle = await getAllCategoriesManifest();
  const dateStamp = bundle.generatedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="retention-automation-manifest-${dateStamp}.json"`,
    },
  });
}
