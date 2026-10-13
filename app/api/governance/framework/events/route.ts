import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { listCommEvents, createCommEvent, CommEventError } from "@/lib/queries/gov-comm-events";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ events: await listCommEvents() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const eventId = await createCommEvent(await req.json(), session.userId);
    return NextResponse.json({ eventId }, { status: 201 });
  } catch (e) {
    if (e instanceof CommEventError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
