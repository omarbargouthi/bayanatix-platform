import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Returns requests split into: raised by me, and open requests on assets I steward
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [myRaised, onMyAssets] = await Promise.all([
    // Requests I raised
    sql<{
      requestId: number; requestTypeCode: string; title: string;
      priorityCode: string; statusCode: string; createdAt: string; targetCount: number;
    }[]>`
      SELECT
        ar.request_id        AS "requestId",
        ar.request_type_code AS "requestTypeCode",
        ar.title,
        ar.priority_code     AS "priorityCode",
        ar.status_code       AS "statusCode",
        ar.created_at::text  AS "createdAt",
        (SELECT count(*)::int FROM bayanat.asset_request_targets t WHERE t.request_id = ar.request_id) AS "targetCount"
      FROM bayanat.asset_requests ar
      WHERE ar.raised_by_user_id = ${session.userId}
      ORDER BY ar.created_at DESC
      LIMIT 50
    `,
    // Open requests on assets I steward
    sql<{
      requestId: number; requestTypeCode: string; title: string;
      priorityCode: string; statusCode: string; createdAt: string;
      raisedByName: string | null; assetName: string | null; assetTypeCode: string;
    }[]>`
      SELECT DISTINCT
        ar.request_id        AS "requestId",
        ar.request_type_code AS "requestTypeCode",
        ar.title,
        ar.priority_code     AS "priorityCode",
        ar.status_code       AS "statusCode",
        ar.created_at::text  AS "createdAt",
        u.full_name          AS "raisedByName",
        art.asset_name       AS "assetName",
        art.asset_type_code  AS "assetTypeCode"
      FROM bayanat.asset_requests ar
      JOIN bayanat.asset_request_targets art ON art.request_id = ar.request_id
      JOIN bayanat.asset_stakeholders stk
        ON stk.asset_type_code = art.asset_type_code
        AND stk.asset_id = art.asset_id
        AND stk.user_id = ${session.userId}
      LEFT JOIN bayanat.users u ON u.user_id = ar.raised_by_user_id
      WHERE ar.status_code IN ('OPEN', 'IN_PROGRESS')
      ORDER BY
        CASE ar.priority_code WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        ar.created_at DESC
      LIMIT 50
    `,
  ]);

  return NextResponse.json({ myRaised, onMyAssets });
}
