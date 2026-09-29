import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { suggestRelationships, getCategoryRelationships } from "@/lib/queries/retention-relationships";

export async function GET(req: Request, { params }: { params: { categoryId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categoryId = Number(params.categoryId);
  const { searchParams } = new URL(req.url);
  const fromEntityId = Number(searchParams.get("fromEntityId"));
  if (!Number.isFinite(categoryId) || !Number.isFinite(fromEntityId)) {
    return NextResponse.json({ error: "categoryId and fromEntityId are required" }, { status: 400 });
  }
  const excludeParam = searchParams.get("exclude");
  const exclude = excludeParam ? excludeParam.split(",").map(Number).filter(Number.isFinite) : [];

  const [candidates, existing] = await Promise.all([
    suggestRelationships(fromEntityId, exclude),
    getCategoryRelationships(categoryId),
  ]);
  const registeredChildAttrIds = new Set(existing.map((r) => `${r.parentEntityId}:${r.childEntityId}`));
  const filtered = candidates.filter((c) => !registeredChildAttrIds.has(`${c.parentEntityId}:${c.childEntityId}`));

  return NextResponse.json(filtered);
}
