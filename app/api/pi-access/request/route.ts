import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { startWorkflow } from "@/lib/workflow";

// Dedicated endpoint for PI_CLEAR_TEXT_ACCESS requests (rather than the
// generic POST /api/requests) so the request can also capture a legal basis
// (bayanat.pi_access_requests) alongside the free-text purpose that generic
// endpoint already supports via description_text.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityId, entityName, purpose, legalBasis } = await req.json() as {
    entityId: number; entityName: string; purpose: string; legalBasis: string;
  };
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });
  if (!purpose?.trim()) return NextResponse.json({ error: "Purpose of use is required" }, { status: 400 });
  if (!legalBasis?.trim()) return NextResponse.json({ error: "Legal basis is required" }, { status: 400 });

  const title = `PI clear-text access: ${entityName}`;
  const [created] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests
      (request_type_code, title, description_text, priority_code, raised_by_user_id)
    VALUES ('PI_CLEAR_TEXT_ACCESS', ${title}, ${purpose.trim()}, 'MEDIUM', ${session.userId})
    RETURNING request_id AS "requestId"
  `;
  await sql`
    INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
    VALUES (${created.requestId}, 'DATA_ENTITIES', ${entityId}, ${entityName ?? null})
  `;
  await sql`
    INSERT INTO bayanat.pi_access_requests (request_id, legal_basis_text)
    VALUES (${created.requestId}, ${legalBasis.trim()})
  `;

  await startWorkflow(created.requestId, "PI_CLEAR_TEXT_ACCESS", title).catch(() => {});

  return NextResponse.json({ ok: true, requestId: created.requestId }, { status: 201 });
}
