import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { updateSchema } from "@/lib/queries/catalog";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const schemaId = Number(params.id);
    if (isNaN(schemaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { description } = await req.json();
    await updateSchema(schemaId, session.userId, typeof description === "string" ? description : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/catalog/schemas/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
