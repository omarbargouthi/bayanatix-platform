import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { assetType: string; assetId: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const numericId  = Number(params.assetId);
  const isStringId = isNaN(numericId);

  const rows = await sql<{
    requestId: number; requestTypeCode: string; title: string;
    descriptionText: string | null; priorityCode: string; statusCode: string;
    raisedByUserId: string; raisedByName: string | null;
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
      u.full_name            AS "raisedByName",
      ar.resolution_notes    AS "resolutionNotes",
      ar.created_at::text    AS "createdAt",
      ar.updated_at::text    AS "updatedAt"
    FROM bayanat.asset_requests ar
    JOIN bayanat.asset_request_targets art
      ON art.request_id = ar.request_id
      AND art.asset_type_code = ${params.assetType}
      AND ${isStringId
        ? sql`art.asset_id_text = ${params.assetId}`
        : sql`art.asset_id = ${numericId}`
      }
    LEFT JOIN bayanat.users u ON u.user_id = ar.raised_by_user_id
    ORDER BY
      CASE ar.priority_code WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
      ar.created_at DESC
  `;

  if (rows.length === 0) return NextResponse.json([]);

  type TargetRow = { requestId: number; assetTypeCode: string; assetId: number | null; assetIdText: string | null; assetName: string | null };
  const ids = rows.map((r) => r.requestId);
  const targets = await sql<TargetRow[]>`
    SELECT request_id      AS "requestId",
           asset_type_code AS "assetTypeCode",
           asset_id        AS "assetId",
           asset_id_text   AS "assetIdText",
           asset_name      AS "assetName"
    FROM bayanat.asset_request_targets
    WHERE request_id IN ${sql(ids)}
  `;
  const tmap = new Map<number, TargetRow[]>();
  for (const t of targets) {
    const arr: TargetRow[] = tmap.get(t.requestId) ?? [];
    arr.push(t);
    tmap.set(t.requestId, arr);
  }

  return NextResponse.json(rows.map((r) => ({ ...r, targets: tmap.get(r.requestId) ?? [] })));
}
