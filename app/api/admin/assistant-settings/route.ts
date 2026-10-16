import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isApplyEnabled, setApplyEnabled } from "@/lib/chat/classification-apply";

// Ask Bayanis settings (Configuration › Ask Bayanis). Administrators only.
// applyClassification: whether users who may edit metadata can apply the assistant's
// classification advice with an Apply button. Off by default; changes are audited.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ applyClassification: await isApplyEnabled() });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.applyClassification !== "boolean") return NextResponse.json({ error: "applyClassification must be true or false" }, { status: 400 });
  await setApplyEnabled(body.applyClassification, session.userId);
  return NextResponse.json({ applyClassification: await isApplyEnabled() });
}
