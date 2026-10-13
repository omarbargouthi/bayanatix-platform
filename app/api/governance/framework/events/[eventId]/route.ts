import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { updateCommEvent, deleteCommEvent, CommEventError } from "@/lib/queries/gov-comm-events";

export async function PATCH(req: Request, { params }: { params: { eventId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const found = await updateCommEvent(Number(params.eventId), await req.json());
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CommEventError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: { eventId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteCommEvent(Number(params.eventId));
  return NextResponse.json({ ok: true });
}
