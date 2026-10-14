import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";
import { isDpiaReviewer } from "@/lib/privacy/dpia";
import { respond } from "@/lib/privacy/dpia-http";
import { updateQuestion, removeQuestion, restoreQuestion, moveQuestion } from "@/lib/privacy/dpia-templates";

type Ctx = { params: { tid: string; qid: string } };
async function reviewer(): Promise<{ session: SessionUser } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isDpiaReviewer(session.role)) return { response: NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

// PATCH { action: "MOVE", direction: "UP" | "DOWN" } | { action: "RESTORE" } | the question's fields
export async function PATCH(req: Request, { params }: Ctx) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  const id = Number(params.qid);
  const b = await req.json().catch(() => ({}));
  if (b.action === "MOVE") return respond(await moveQuestion(id, b.direction, v.session));
  if (b.action === "RESTORE") return respond(await restoreQuestion(id, v.session));
  return respond(await updateQuestion(id, b, v.session));
}

// DELETE — deletes the question, or retires it when assessments have answered it.
export async function DELETE(_req: Request, { params }: Ctx) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  return respond(await removeQuestion(Number(params.qid), v.session));
}
