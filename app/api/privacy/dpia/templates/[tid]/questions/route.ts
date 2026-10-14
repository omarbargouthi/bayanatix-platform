import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";
import { isDpiaReviewer } from "@/lib/privacy/dpia";
import { respond } from "@/lib/privacy/dpia-http";
import { addQuestion } from "@/lib/privacy/dpia-templates";

async function reviewer(): Promise<{ session: SessionUser } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isDpiaReviewer(session.role)) return { response: NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

// POST { stage, section, text, textAr?, help?, helpAr?, reference?, autoCode?, required? }
export async function POST(req: Request, { params }: { params: { tid: string } }) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  return respond(await addQuestion(Number(params.tid), await req.json().catch(() => ({})), v.session));
}
