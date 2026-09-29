import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isDataPrivacyOfficer } from "@/lib/can";

type Ctx = { params: { holdId: string } };

async function canManageDeletion(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): Promise<boolean> {
  return session.role === "ADMIN" || await isDataPrivacyOfficer(session);
}

export async function PUT(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.holdId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const { holdStatus, releaseDate, releaseAuthority, releaseJustification, notes, restore } = body;

  // Restoring is its own permission (ADMIN or Data Privacy Officer) — checked
  // before, not after, the generic ADMIN/OFFICER release-workflow gate below,
  // since a Data Privacy Officer's own session.role may be neither.
  if (restore) {
    if (!(await canManageDeletion(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await sql`
      UPDATE bayanat.legal_holds SET is_deleted = false, deleted_at = NULL, deleted_by_user_id = NULL
      WHERE hold_id = ${id}
    `;
    return NextResponse.json({ ok: true });
  }

  if (session.role !== "ADMIN" && session.role !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDeletion(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = Number(params.holdId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await sql`
    UPDATE bayanat.legal_holds SET is_deleted = true, deleted_at = NOW(), deleted_by_user_id = ${session.userId}
    WHERE hold_id = ${id}
  `;
  return NextResponse.json({ ok: true });
}
