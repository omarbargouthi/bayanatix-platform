import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { startWorkflow } from "@/lib/workflow";

const CAN_EDIT_ROLES = new Set(["ADMIN", "STEWARD", "OFFICER"]);

async function isRootDomain(glossaryId: number): Promise<boolean> {
  const [row] = await sql<{ parentId: number | null }[]>`
    SELECT parent_glossary_id AS "parentId" FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  return !!row && row.parentId == null;
}

// Effective governance for one glossary item — recursively resolved up the
// Domain -> Sub-domain -> Term chain (fn_resolve_glossary_owner/_stewards,
// db/100_glossary_governance.sql): an item's own owner_user_id / rows in
// glossary_stewards win if set, otherwise inherited from its nearest
// ancestor that has one. Root domains (no parent) are the source of that
// inheritance and are edited directly; anywhere else, an override that
// differs from what's inherited requires DMO Manager sign-off (see the
// override handler below) rather than being applied immediately.
export async function handleOwnershipGET(glossaryId: number, requesterUserId?: string) {
  const [term] = await sql<{ parentId: number | null; ownerUserId: string | null; termName: string }[]>`
    SELECT parent_glossary_id AS "parentId", owner_user_id AS "ownerUserId", term_name_text AS "termName"
    FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  if (!term) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isRoot = term.parentId == null;

  const [ownStewards, effectiveOwnerRows, effectiveStewardRows, pendingRows] = await Promise.all([
    sql<{ stewardId: number; userId: string; fullName: string | null; email: string | null; assignedAt: string }[]>`
      SELECT gs.steward_id AS "stewardId", gs.user_id AS "userId", u.full_name AS "fullName", u.email, gs.assigned_at::text AS "assignedAt"
      FROM bayanat.glossary_stewards gs JOIN bayanat.users u ON u.user_id = gs.user_id
      WHERE gs.glossary_id = ${glossaryId} ORDER BY u.full_name
    `,
    sql<{ userId: string; fullName: string | null; email: string | null; resolvedFromId: number; resolvedFromName: string | null }[]>`
      SELECT r.user_id AS "userId", u.full_name AS "fullName", u.email,
             r.resolved_from_id AS "resolvedFromId", p.term_name_text AS "resolvedFromName"
      FROM bayanat.fn_resolve_glossary_owner(${glossaryId}) r
      JOIN bayanat.users u ON u.user_id = r.user_id
      JOIN bayanat.business_glossaries p ON p.glossary_id = r.resolved_from_id
    `,
    sql<{ userId: string; fullName: string | null; email: string | null; resolvedFromId: number; resolvedFromName: string | null }[]>`
      SELECT r.user_id AS "userId", u.full_name AS "fullName", u.email,
             r.resolved_from_id AS "resolvedFromId", p.term_name_text AS "resolvedFromName"
      FROM bayanat.fn_resolve_glossary_stewards(${glossaryId}) r
      JOIN bayanat.users u ON u.user_id = r.user_id
      JOIN bayanat.business_glossaries p ON p.glossary_id = r.resolved_from_id
      ORDER BY u.full_name
    `,
    requesterUserId
      ? sql<{ requestId: number }[]>`
          SELECT ar.request_id AS "requestId"
          FROM bayanat.asset_requests ar
          JOIN bayanat.glossary_governance_change_requests gc ON gc.request_id = ar.request_id
          WHERE gc.glossary_id = ${glossaryId} AND ar.raised_by_user_id = ${requesterUserId}
            AND ar.status_code IN ('OPEN','IN_PROGRESS')
          ORDER BY ar.created_at DESC LIMIT 1
        `
      : Promise.resolve([]),
  ]);

  const effOwner = effectiveOwnerRows[0];
  return NextResponse.json({
    glossaryId,
    isRoot,
    termName: term.termName,
    ownOwnerUserId: term.ownerUserId,
    ownStewards,
    effectiveOwner: effOwner ? { ...effOwner, isOwn: effOwner.resolvedFromId === glossaryId } : null,
    effectiveStewards: effectiveStewardRows,
    pendingRequestId: pendingRows[0]?.requestId ?? null,
  });
}

export async function handleOwnershipPATCH(req: Request, glossaryId: number, sessionRole: string) {
  if (!CAN_EDIT_ROLES.has(sessionRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isRootDomain(glossaryId))) {
    return NextResponse.json({ error: "Only a root Domain's governance can be set directly — use the override endpoint for Sub-domains and Terms" }, { status: 400 });
  }
  const { ownerUserId } = await req.json() as { ownerUserId: string | null };
  await sql`UPDATE bayanat.business_glossaries SET owner_user_id = ${ownerUserId ?? null} WHERE glossary_id = ${glossaryId}`;
  return NextResponse.json({ ok: true });
}

export async function handleOwnershipPOST(req: Request, glossaryId: number, assignedBy: string, sessionRole: string) {
  if (!CAN_EDIT_ROLES.has(sessionRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isRootDomain(glossaryId))) {
    return NextResponse.json({ error: "Only a root Domain's governance can be set directly — use the override endpoint for Sub-domains and Terms" }, { status: 400 });
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
  if (!CAN_EDIT_ROLES.has(sessionRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isRootDomain(glossaryId))) {
    return NextResponse.json({ error: "Only a root Domain's governance can be set directly — use the override endpoint for Sub-domains and Terms" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const stewardId = searchParams.get("stewardId") ? Number(searchParams.get("stewardId")) : null;
  if (!stewardId) return NextResponse.json({ error: "stewardId required" }, { status: 400 });
  await sql`DELETE FROM bayanat.glossary_stewards WHERE steward_id = ${stewardId} AND glossary_id = ${glossaryId}`;
  return NextResponse.json({ ok: true });
}

// Sub-domain / Term override — proposes a full replacement Owner + Steward
// set for this exact item, routed through the "Glossary Governance Override
// Approval" workflow (DMO Manager sign-off, db/100) instead of applying
// immediately. Root domains reject here — they're edited directly above.
export async function handleOwnershipOverridePOST(req: Request, glossaryId: number, raisedByUserId: string, sessionRole: string) {
  if (!CAN_EDIT_ROLES.has(sessionRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isRootDomain(glossaryId)) {
    return NextResponse.json({ error: "A root Domain's governance is set directly, not via override" }, { status: 400 });
  }
  const { proposedOwnerId, proposedStewardIds, justification } = await req.json() as {
    proposedOwnerId: string | null; proposedStewardIds: string[]; justification: string;
  };
  if (!justification?.trim()) return NextResponse.json({ error: "Justification is required" }, { status: 400 });
  if (!proposedOwnerId && (!proposedStewardIds || proposedStewardIds.length === 0)) {
    return NextResponse.json({ error: "Propose an owner and/or at least one steward" }, { status: 400 });
  }

  const [glossary] = await sql<{ termName: string }[]>`
    SELECT term_name_text AS "termName" FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  if (!glossary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const title = `Override governance for "${glossary.termName}"`;
  const [created] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests
      (request_type_code, title, description_text, priority_code, raised_by_user_id)
    VALUES ('OVERRIDE_GLOSSARY_GOVERNANCE', ${title}, ${justification.trim()}, 'MEDIUM', ${raisedByUserId})
    RETURNING request_id AS "requestId"
  `;
  await sql`
    INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
    VALUES (${created.requestId}, 'BUSINESS_GLOSSARIES', ${glossaryId}, ${glossary.termName})
  `;
  await sql`
    INSERT INTO bayanat.glossary_governance_change_requests
      (request_id, glossary_id, proposed_owner_user_id, proposed_steward_ids, justification_text)
    VALUES (${created.requestId}, ${glossaryId}, ${proposedOwnerId || null}, ${proposedStewardIds ?? []}, ${justification.trim()})
  `;
  await startWorkflow(created.requestId, "OVERRIDE_GLOSSARY_GOVERNANCE", title).catch(() => {});
  return NextResponse.json({ ok: true, pending: true, requestId: created.requestId }, { status: 201 });
}
