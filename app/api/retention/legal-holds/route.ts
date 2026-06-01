import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holds = await sql<{
    holdId: number;
    caseReference: string;
    caseName: string;
    holdScopeType: string;
    holdDate: string;
    releaseDate: string | null;
    holdStatus: string;
    placedBy: string;
    placedByName: string | null;
    releaseAuthority: string | null;
    releaseJustification: string | null;
    notes: string | null;
    createdAt: string;
  }[]>`
    SELECT
      lh.hold_id              AS "holdId",
      lh.case_reference       AS "caseReference",
      lh.case_name            AS "caseName",
      lh.hold_scope_type      AS "holdScopeType",
      lh.hold_date            AS "holdDate",
      lh.release_date         AS "releaseDate",
      lh.hold_status          AS "holdStatus",
      lh.placed_by            AS "placedBy",
      u.full_name             AS "placedByName",
      lh.release_authority    AS "releaseAuthority",
      lh.release_justification AS "releaseJustification",
      lh.notes                AS notes,
      lh.created_at           AS "createdAt"
    FROM bayanat.legal_holds lh
    LEFT JOIN bayanat.users u ON u.user_id = lh.placed_by
    ORDER BY lh.hold_status = 'ACTIVE' DESC, lh.hold_date DESC
  `;

  // Fetch categories per hold
  const holdIds = holds.map((h) => h.holdId);
  const cats =
    holdIds.length > 0
      ? await sql<{ holdId: number; categoryId: number; categoryName: string }[]>`
          SELECT
            lhc.hold_id       AS "holdId",
            dc.category_id    AS "categoryId",
            dc.name           AS "categoryName"
          FROM bayanat.legal_hold_categories lhc
          JOIN bayanat.data_categories dc ON dc.category_id = lhc.category_id
          WHERE lhc.hold_id = ANY(${holdIds})
        `
      : [];

  const catsByHold = new Map<number, { categoryId: number; name: string }[]>();
  for (const c of cats) {
    const list = catsByHold.get(c.holdId) ?? [];
    list.push({ categoryId: c.categoryId, name: c.categoryName });
    catsByHold.set(c.holdId, list);
  }

  const result = holds.map((h) => ({
    ...h,
    categoryIds: (catsByHold.get(h.holdId) ?? []).map((c) => c.categoryId),
    categoryNames: (catsByHold.get(h.holdId) ?? []).map((c) => c.name),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { caseReference, caseName, holdScopeType, holdDate, notes, categoryIds } = body;
  if (!caseReference || !caseName || !holdScopeType || !holdDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [hold] = await sql<{ holdId: number }[]>`
    INSERT INTO bayanat.legal_holds (case_reference, case_name, hold_scope_type, hold_date, placed_by, notes)
    VALUES (${caseReference}, ${caseName}, ${holdScopeType}, ${holdDate}, ${session.userId}, ${notes ?? null})
    RETURNING hold_id AS "holdId"
  `;

  if (categoryIds?.length > 0) {
    for (const cid of categoryIds as number[]) {
      await sql`INSERT INTO bayanat.legal_hold_categories (hold_id, category_id) VALUES (${hold.holdId}, ${cid}) ON CONFLICT DO NOTHING`;
    }
  }

  return NextResponse.json({ holdId: hold.holdId }, { status: 201 });
}
