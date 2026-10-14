import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { respond } from "@/lib/privacy/dpia-http";
import { dismissDpiaSuggestion, restoreDpiaSuggestion } from "@/lib/privacy/dpia-watch";

// PATCH { action: "DISMISS", note } | { action: "RESTORE" } — admin or data protection officer.
export async function PATCH(req: Request, { params }: { params: { sid: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.sid);
  const b = await req.json().catch(() => ({}));
  if (b.action === "DISMISS") return respond(await dismissDpiaSuggestion(id, b.note, session));
  if (b.action === "RESTORE") return respond(await restoreDpiaSuggestion(id, session));
  return NextResponse.json({ error: "Unknown action", code: "UNKNOWN_ACTION" }, { status: 400 });
}
