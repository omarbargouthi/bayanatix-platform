import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canReadData, roleAllowsPiClearText, hasPiClearTextGrant } from "@/lib/can";
import { getLiveSampleRows, getPiColumnNames } from "@/lib/sample-data";
import { getSampleDataSettings } from "@/lib/sample-data-settings";

const MASK = "●●●●●●";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityId = Number(params.id);
  if (!Number.isFinite(entityId)) return NextResponse.json({ error: "Invalid entity id" }, { status: 400 });

  const authorized = await canReadData(session, entityId);
  if (!authorized) {
    return NextResponse.json({ authorized: false }, { status: 403 });
  }

  const [{ sampleRecordCount }, piColumns] = await Promise.all([
    getSampleDataSettings(),
    getPiColumnNames(entityId),
  ]);
  const live = await getLiveSampleRows(entityId, sampleRecordCount);

  if (!live.live) {
    return NextResponse.json({ authorized: true, live: false, reason: live.reason, sampleRecordCount });
  }

  const [piEligible, piGranted, [pendingRequest]] = await Promise.all([
    roleAllowsPiClearText(session, entityId),
    hasPiClearTextGrant(session.userId, entityId),
    sql<{ requestId: number }[]>`
      SELECT ar.request_id AS "requestId"
      FROM bayanat.asset_requests ar
      JOIN bayanat.asset_request_targets art ON art.request_id = ar.request_id
      WHERE ar.request_type_code = 'PI_CLEAR_TEXT_ACCESS'
        AND ar.raised_by_user_id = ${session.userId}
        AND ar.status_code IN ('OPEN','IN_PROGRESS')
        AND art.asset_type_code = 'DATA_ENTITIES' AND art.asset_id = ${entityId}
      ORDER BY ar.created_at DESC LIMIT 1
    `,
  ]);
  const canViewClearText = session.role === "ADMIN" || (piEligible && piGranted);

  const rows = live.rows.map((row) => {
    if (canViewClearText) return row;
    const masked: Record<string, unknown> = {};
    for (const [col, val] of Object.entries(row)) {
      masked[col] = piColumns.has(col) && val != null ? MASK : val;
    }
    return masked;
  });

  return NextResponse.json({
    authorized: true,
    live: true,
    columns: live.columns,
    rows,
    sampleRecordCount,
    piColumns: [...piColumns],
    canViewClearText,
    piEligible,
    piGranted,
    pendingRequestId: pendingRequest?.requestId ?? null,
  });
}
