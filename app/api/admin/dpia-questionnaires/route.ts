import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { respond } from "@/lib/privacy/dpia-http";
import { listTemplatesForAdmin, setQuestionnaireUse } from "@/lib/privacy/dpia-templates";

// Configuration › Privacy & Retention: which impact assessment questionnaires are used.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listTemplatesForAdmin());
}

// PUT { activeIds: number[], defaultId: number }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return respond(await setQuestionnaireUse(await req.json().catch(() => ({})), session));
}
