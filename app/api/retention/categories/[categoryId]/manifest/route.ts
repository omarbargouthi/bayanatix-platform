import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCategoryManifest } from "@/lib/queries/retention";

export async function GET(_req: Request, { params }: { params: { categoryId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categoryId = Number(params.categoryId);
  if (!Number.isFinite(categoryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const manifest = await getCategoryManifest(categoryId);
  if (!manifest) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  return NextResponse.json(manifest);
}
