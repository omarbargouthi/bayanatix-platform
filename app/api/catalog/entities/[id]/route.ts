import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { updateEntity } from "@/lib/queries/catalog";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const entityId = Number(params.id);
    if (isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { description, displayName, category } = await req.json();
    if (typeof description !== "string") {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    await updateEntity(entityId, session.userId, {
      description,
      displayName: displayName ?? "",
      category:    category    ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/catalog/entities/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
