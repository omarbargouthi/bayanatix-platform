import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listManualProcesses, createManualProcess } from "@/lib/lineage/manual-processes";

// GET — the named manual processes (with link counts). Anyone who can see lineage.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listManualProcesses());
}

// POST { name, description? } — create a named process (steward/admin).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const res = await createManualProcess(String(b.name ?? ""), b.description == null ? null : String(b.description), session.userId);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res, { status: 201 });
}
