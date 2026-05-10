import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { startWorkflow } from "@/lib/workflow";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get("assetType");
  const assetId   = searchParams.get("assetId");
  const raisedBy  = searchParams.get("raisedBy");
  const status    = searchParams.get("status");
  const mine      = searchParams.get("mine"); // "raised" | "owned"
  const domain    = searchParams.get("domain"); // governance domain code filter

  const numericAssetId  = assetId ? Number(assetId) : NaN;
  const assetIdIsString = assetId ? isNaN(numericAssetId) : false;

  const rows = await sql<{
    requestId: number; requestTypeCode: string; title: string;
    descriptionText: string | null; priorityCode: string; statusCode: string;
    raisedByUserId: string; raisedByName: string | null;
    assignedToUserId: string | null; assignedToName: string | null;
    resolutionNotes: string | null; createdAt: string; updatedAt: string;
  }[]>`
    SELECT DISTINCT
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
    ${assetType && assetId ? sql`
      JOIN bayanat.asset_request_targets art
        ON art.request_id = ar.request_id
        AND art.asset_type_code = ${assetType}
        AND ${assetIdIsString
          ? sql`art.asset_id_text = ${assetId}`
          : sql`art.asset_id = ${numericAssetId}`
        }
    ` : sql``}
    ${domain ? sql`
      JOIN bayanat.asset_request_targets art_dom
        ON art_dom.request_id = ar.request_id
        AND art_dom.asset_type_code = 'GOVERNANCE_DOMAIN'
        AND art_dom.asset_id_text = ${domain}
    ` : sql``}
    ${mine === "owned" ? sql`
      JOIN bayanat.asset_request_targets art2
        ON art2.request_id = ar.request_id
      JOIN bayanat.asset_stakeholders stk
        ON stk.asset_type_code = art2.asset_type_code
        AND stk.asset_id = art2.asset_id
        AND stk.user_id = ${session.userId}
    ` : sql``}
    WHERE true
    ${raisedBy ? sql`AND ar.raised_by_user_id = ${raisedBy}` : sql``}
    ${mine === "raised" ? sql`AND ar.raised_by_user_id = ${session.userId}` : sql``}
    ${mine === "owned" ? sql`AND ar.status_code IN ('OPEN','IN_PROGRESS')` : sql``}
    ${status ? sql`AND ar.status_code = ${status}` : sql``}
    ORDER BY ar.created_at DESC
  `;

  if (rows.length === 0) return NextResponse.json([]);

  const ids = rows.map((r) => r.requestId);
  const targets = await sql<{
    requestId: number; targetId: number; assetTypeCode: string;
    assetId: number | null; assetIdText: string | null; assetName: string | null;
  }[]>`
    SELECT request_id      AS "requestId",
           target_id       AS "targetId",
           asset_type_code AS "assetTypeCode",
           asset_id        AS "assetId",
           asset_id_text   AS "assetIdText",
           asset_name      AS "assetName"
    FROM bayanat.asset_request_targets
    WHERE request_id IN ${sql(ids)}
    ORDER BY target_id
  `;
  type TargetRow = { requestId: number; targetId: number; assetTypeCode: string; assetId: number | null; assetIdText: string | null; assetName: string | null };
  const targetsByRequest = new Map<number, TargetRow[]>();
  for (const t of targets) {
    const arr: TargetRow[] = targetsByRequest.get(t.requestId) ?? [];
    arr.push(t as TargetRow);
    targetsByRequest.set(t.requestId, arr);
  }
  return NextResponse.json(
    rows.map((r) => ({ ...r, targets: targetsByRequest.get(r.requestId) ?? [] }))
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestTypeCode, title, descriptionText, priorityCode, targets } = await req.json();

  const VALID_TYPES = ["FIX_DATA_ISSUE", "UPDATE_DEFINITION", "CERTIFY_ASSET", "GRANT_ACCESS", "REMOVE_ACCESS", "OTHER"];
  if (!VALID_TYPES.includes(requestTypeCode))
    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  if (!title?.trim())
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!["HIGH", "MEDIUM", "LOW"].includes(priorityCode))
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  if (!Array.isArray(targets) || targets.length === 0)
    return NextResponse.json({ error: "At least one target asset is required" }, { status: 400 });

  const [created] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests
      (request_type_code, title, description_text, priority_code, raised_by_user_id)
    VALUES (${requestTypeCode}, ${title.trim()}, ${descriptionText?.trim() || null}, ${priorityCode}, ${session.userId})
    RETURNING request_id AS "requestId"
  `;

  for (const t of targets) {
    const numId   = Number(t.assetId);
    const isStrId = isNaN(numId);
    if (isStrId) {
      await sql`
        INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id_text, asset_name)
        VALUES (${created.requestId}, ${t.assetTypeCode}, ${t.assetId as string}, ${t.assetName ?? null})
      `;
    } else {
      await sql`
        INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
        VALUES (${created.requestId}, ${t.assetTypeCode}, ${numId}, ${t.assetName ?? null})
      `;
    }
  }

  // Start the workflow assigned to this request type (non-blocking — ignore errors)
  await startWorkflow(created.requestId, requestTypeCode, title.trim()).catch(() => {});

  return NextResponse.json({ ok: true, requestId: created.requestId });
}
