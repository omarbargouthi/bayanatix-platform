import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { decideSuggestion } from "@/lib/lineage/propagation";

type Ctx = { params: { id: string } };

// POST { action: "ACCEPT" | "REJECT" } — a steward's decision on a propagation suggestion.
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { action } = await req.json().catch(() => ({}));
  if (action !== "ACCEPT" && action !== "REJECT") return NextResponse.json({ error: "action must be ACCEPT or REJECT" }, { status: 400 });

  const result = await decideSuggestion(id, session.userId, action === "ACCEPT");
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
