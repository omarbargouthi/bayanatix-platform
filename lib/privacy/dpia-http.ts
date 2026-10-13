// Shared by the impact assessment API routes: who may see an assessment, and how a
// result of lib/privacy/dpia becomes a response.
import { NextResponse } from "next/server";
import { getSession } from "../auth";
import type { SessionUser } from "../types";
import { canViewDpia, type DpiaError } from "./dpia";

const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403 };

/** Errors keep their code so the screen can show them in the user's language. */
export function respond(res: object | DpiaError): NextResponse {
  if ("error" in res) return NextResponse.json(res, { status: STATUS[(res as DpiaError).code] ?? 400 });
  return NextResponse.json(res);
}

/** The signed-in user, when they may see this assessment; otherwise the response to send. */
export async function viewer(id: number): Promise<{ session: SessionUser } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!Number.isFinite(id) || !(await canViewDpia(session, id))) return { response: NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 }) };
  return { session };
}
