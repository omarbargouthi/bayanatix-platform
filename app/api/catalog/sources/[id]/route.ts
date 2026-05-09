import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { updateDataSource } from "@/lib/queries/catalog";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sourceId = Number(params.id);
    if (isNaN(sourceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { description, businessAppName } = await req.json();
    await updateDataSource(sourceId, session.userId, {
      description:     typeof description    === "string" ? description    : "",
      businessAppName: typeof businessAppName === "string" ? businessAppName : "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/catalog/sources/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
