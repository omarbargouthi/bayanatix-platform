import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { overrideSuggestion } from "@/lib/queries/classification";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const attributeId = Number(params.id);
  if (!Number.isFinite(attributeId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const classCode = body.class_code as "BUSINESS" | "TECHNICAL";
  const reason = body.reason as string;
  const addPattern = body.add_pattern as { patternGroupCode: string; regex: string; scopeToSource: boolean } | undefined;

  if (classCode !== "BUSINESS" && classCode !== "TECHNICAL") {
    return NextResponse.json({ error: "class_code must be BUSINESS or TECHNICAL" }, { status: 400 });
  }
  if (!reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  try {
    await overrideSuggestion(attributeId, session.userId, classCode, reason, addPattern);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
