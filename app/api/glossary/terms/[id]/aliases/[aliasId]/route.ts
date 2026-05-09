import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { deleteAlias } from "@/lib/queries/glossary";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; aliasId: string } },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const aliasId = Number(params.aliasId);
    if (isNaN(aliasId)) return NextResponse.json({ error: "Invalid aliasId" }, { status: 400 });

    await deleteAlias(aliasId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/glossary/terms/[id]/aliases/[aliasId]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
