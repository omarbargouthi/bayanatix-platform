import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateDsrItem } from "@/lib/privacy/dsr";

type Ctx = { params: { id: string; itemId: string } };

// PATCH { status: PENDING | DONE | NOT_FOUND | EXEMPT, note? } — record what was done
// in one table (admin, data protection officer, or the steward handling it).
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "OFFICER", "STEWARD"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const res = await updateDsrItem(Number(params.id), Number(params.itemId), String(b.status ?? ""), b.note ?? null, session.userId);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
