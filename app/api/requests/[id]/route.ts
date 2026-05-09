import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{
    requestId: number; requestTypeCode: string; title: string;
    descriptionText: string | null; priorityCode: string; statusCode: string;
    raisedByUserId: string; raisedByName: string | null;
    assignedToUserId: string | null; assignedToName: string | null;
    resolutionNotes: string | null; createdAt: string; updatedAt: string;
  }[]>`
    SELECT
      ar.request_id          AS "requestId",
      ar.request_type_code   AS "requestTypeCode",
      ar.title,
      ar.description_text    AS "descriptionText",
      ar.priority_code       AS "priorityCode",
      ar.status_code         AS "statusCode",
      ar.raised_by_user_id   AS "raisedByUserId",
      ru.full_name           AS "raisedByName",
      ar.assigned_to_user_id AS "assignedToUserId",
      au.full_name           AS "assignedToName",
      ar.resolution_notes    AS "resolutionNotes",
      ar.created_at::text    AS "createdAt",
      ar.updated_at::text    AS "updatedAt"
    FROM bayanat.asset_requests ar
    LEFT JOIN bayanat.users ru ON ru.user_id = ar.raised_by_user_id
    LEFT JOIN bayanat.users au ON au.user_id = ar.assigned_to_user_id
    WHERE ar.request_id = ${Number(params.id)}
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targets = await sql<{
    targetId: number; assetTypeCode: string; assetId: number; assetName: string | null;
  }[]>`
    SELECT target_id AS "targetId", asset_type_code AS "assetTypeCode",
           asset_id AS "assetId", asset_name AS "assetName"
    FROM bayanat.asset_request_targets
    WHERE request_id = ${Number(params.id)}
    ORDER BY target_id
  `;

  return NextResponse.json({ ...rows[0], targets });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { statusCode, assignedToUserId, resolutionNotes } = await req.json();

  const VALID_STATUS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
  if (statusCode && !VALID_STATUS.includes(statusCode))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  await sql`
    UPDATE bayanat.asset_requests SET
      status_code         = COALESCE(${statusCode ?? null}, status_code),
      assigned_to_user_id = COALESCE(${assignedToUserId ?? null}, assigned_to_user_id),
      resolution_notes    = COALESCE(${resolutionNotes ?? null}, resolution_notes),
      updated_at          = NOW()
    WHERE request_id = ${Number(params.id)}
  `;
  return NextResponse.json({ ok: true });
}
