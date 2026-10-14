import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";
import { isDpiaReviewer } from "@/lib/privacy/dpia";
import { respond } from "@/lib/privacy/dpia-http";
import { getTemplateForAdmin, updateTemplate, deleteTemplate } from "@/lib/privacy/dpia-templates";

type Ctx = { params: { tid: string } };
async function reviewer(): Promise<{ session: SessionUser } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isDpiaReviewer(session.role)) return { response: NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

export async function GET(_req: Request, { params }: Ctx) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  const t = await getTemplateForAdmin(Number(params.tid));
  return t ? NextResponse.json(t) : NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
}

// PATCH { name?, nameAr?, regulation?, regulationAr?, description?, descriptionAr?, threshold?, isActive?, isDefault? }
export async function PATCH(req: Request, { params }: Ctx) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  return respond(await updateTemplate(Number(params.tid), await req.json().catch(() => ({})), v.session));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const v = await reviewer();
  if ("response" in v) return v.response;
  return respond(await deleteTemplate(Number(params.tid), v.session));
}
