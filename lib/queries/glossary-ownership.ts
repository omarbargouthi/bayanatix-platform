import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function handleOwnershipGET(glossaryId: number) {
  const [term] = await sql<{ parentId: number | null; ownerUserId: string | null; ownerName: string | null }[]>`
    SELECT
      bg.parent_glossary_id AS "parentId",
      bg.owner_user_id      AS "ownerUserId",
      u.full_name           AS "ownerName"
    FROM bayanat.business_glossaries bg
    LEFT JOIN bayanat.users u ON u.user_id = bg.owner_user_id
    WHERE bg.glossary_id = ${glossaryId}
  `;
  if (!term) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let effectiveOwnerUserId = term.ownerUserId;
  let effectiveOwnerName   = term.ownerName;
  let ownerInheritedFrom: "TERM" | "DOMAIN" | null = term.ownerUserId ? "TERM" : null;

  if (!effectiveOwnerUserId && term.parentId) {
    const [domain] = await sql<{ ownerUserId: string | null; ownerName: string | null }[]>`
      SELECT bg.owner_user_id AS "ownerUserId", u.full_name AS "ownerName"
      FROM bayanat.business_glossaries bg
      LEFT JOIN bayanat.users u ON u.user_id = bg.owner_user_id
      WHERE bg.glossary_id = ${term.parentId}
    `;
    if (domain?.ownerUserId) {
      effectiveOwnerUserId = domain.ownerUserId;
      effectiveOwnerName   = domain.ownerName;
      ownerInheritedFrom   = "DOMAIN";
    }
  }

  const termStewards = await sql<{ stewardId: number; userId: string; fullName: string | null; email: string | null; assignedAt: string }[]>`
    SELECT gs.steward_id AS "stewardId", gs.user_id AS "userId",
           u.full_name AS "fullName", u.email,
           gs.assigned_at::text AS "assignedAt"
    FROM bayanat.glossary_stewards gs
    JOIN bayanat.users u ON u.user_id = gs.user_id
    WHERE gs.glossary_id = ${glossaryId}
    ORDER BY u.full_name
  `;

  let effectiveStewards = termStewards;
  let stewardsInheritedFrom: "TERM" | "DOMAIN" = "TERM";

  if (termStewards.length === 0 && term.parentId) {
    const domainStewards = await sql<{ stewardId: number; userId: string; fullName: string | null; email: string | null; assignedAt: string }[]>`
      SELECT gs.steward_id AS "stewardId", gs.user_id AS "userId",
             u.full_name AS "fullName", u.email,
             gs.assigned_at::text AS "assignedAt"
      FROM bayanat.glossary_stewards gs
      JOIN bayanat.users u ON u.user_id = gs.user_id
      WHERE gs.glossary_id = ${term.parentId}
      ORDER BY u.full_name
    `;
    effectiveStewards     = domainStewards;
    stewardsInheritedFrom = "DOMAIN";
  }

  return NextResponse.json({
    termOwnerUserId: term.ownerUserId,
    effectiveOwnerUserId,
    effectiveOwnerName,
    ownerInheritedFrom,
    termStewards,
    effectiveStewards,
    stewardsInheritedFrom,
  });
}

export async function handleOwnershipPATCH(req: Request, glossaryId: number, sessionRole: string) {
  if (sessionRole !== "ADMIN" && sessionRole !== "STEWARD" && sessionRole !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { ownerUserId } = await req.json() as { ownerUserId: string | null };
  await sql`
    UPDATE bayanat.business_glossaries SET owner_user_id = ${ownerUserId ?? null}
    WHERE glossary_id = ${glossaryId}
  `;
  return NextResponse.json({ ok: true });
}

export async function handleOwnershipPOST(req: Request, glossaryId: number, assignedBy: string, sessionRole: string) {
  if (sessionRole !== "ADMIN" && sessionRole !== "STEWARD" && sessionRole !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await req.json() as { userId: string };
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const [user] = await sql<{ fullName: string | null }[]>`
    SELECT full_name AS "fullName" FROM bayanat.users WHERE user_id = ${userId} AND is_active = true
  `;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [row] = await sql<{ stewardId: number }[]>`
    INSERT INTO bayanat.glossary_stewards (glossary_id, user_id, assigned_by)
    VALUES (${glossaryId}, ${userId}, ${assignedBy})
    ON CONFLICT (glossary_id, user_id) DO NOTHING
    RETURNING steward_id AS "stewardId"
  `;
  return NextResponse.json({ ok: true, stewardId: row?.stewardId ?? null, fullName: user.fullName });
}

export async function handleOwnershipDELETE(req: Request, glossaryId: number, sessionRole: string) {
  if (sessionRole !== "ADMIN" && sessionRole !== "STEWARD" && sessionRole !== "OFFICER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const stewardId = searchParams.get("stewardId") ? Number(searchParams.get("stewardId")) : null;
  if (!stewardId) return NextResponse.json({ error: "stewardId required" }, { status: 400 });
  await sql`
    DELETE FROM bayanat.glossary_stewards
    WHERE steward_id = ${stewardId} AND glossary_id = ${glossaryId}
  `;
  return NextResponse.json({ ok: true });
}
