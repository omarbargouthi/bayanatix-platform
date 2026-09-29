import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCategoryManifest } from "@/lib/queries/retention";

// Downloadable form of GET /api/retention/categories/[categoryId]/manifest —
// same read-only config bundle (see that route's comment for the "external
// automation process, no credentials, Bayanatix never executes anything against
// the source system itself" design), just served with attachment headers so a
// browser click actually saves a file instead of rendering raw JSON.
// Restricted to ADMIN/OFFICER (same gate as legal-hold writes) since the bundle
// includes internal connection host/port and litigation-sensitive legal hold
// case references — tighter than the plain GET route, which predates this file-
// download entry point and nothing else calls yet.
export async function GET(_req: Request, { params }: { params: { categoryId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categoryId = Number(params.categoryId);
  if (!Number.isFinite(categoryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const manifest = await getCategoryManifest(categoryId);
  if (!manifest) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const slug = manifest.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(categoryId);
  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="retention-manifest-${slug}.json"`,
    },
  });
}
