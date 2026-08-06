import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteLink } from "@/lib/queries/custom-assets";
import { logUpdate } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: { linkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const linkId = Number(params.linkId);
  await deleteLink(linkId);
  await logUpdate("CUSTOM_ASSET_LINK", linkId, session.userId, [{ field: "deleted", oldVal: "false", newVal: "true", force: true }]);

  return NextResponse.json({ ok: true });
}
