import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { holdId: string } };

export async function PUT(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.holdId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const { holdStatus, releaseDate, releaseAuthority, releaseJustification, notes } = body;

  await sql`
    UPDATE bayanat.legal_holds SET
      hold_status           = COALESCE(${holdStatus ?? null}, hold_status),
      release_date          = COALESCE(${releaseDate ?? null}, release_date),
      release_authority     = COALESCE(${releaseAuthority ?? null}, release_authority),
      release_justification = COALESCE(${releaseJustification ?? null}, release_justification),
      notes                 = COALESCE(${notes ?? null}, notes)
    WHERE hold_id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
