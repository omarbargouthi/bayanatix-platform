import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";
import { isDpiaReviewer } from "@/lib/privacy/dpia";
import { respond } from "@/lib/privacy/dpia-http";
import { listTemplatesForAdmin, createTemplate } from "@/lib/privacy/dpia-templates";

// The questionnaires, for admins and data protection officers to edit.
async function reviewer(): Promise<{ session: SessionUser } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isDpiaReviewer(session.role)) return { response: NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const v = await reviewer();
  if ("response" in v) return v.response;
  return NextResponse.json(await listTemplatesForAdmin());
}

// POST { name, nameAr?, copyFromId? }
export async function POST(req: Request) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  return respond(await createTemplate(await req.json().catch(() => ({})), v.session));
}
