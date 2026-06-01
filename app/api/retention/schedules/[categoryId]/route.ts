import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { categoryId: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.categoryId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql<{
    scheduleId: number;
    categoryId: number;
    jurisdiction: string;
    triggerEvent: string;
    triggerCustomExpr: string | null;
    retentionPeriod: number;
    retentionUnit: string;
    postRetentionAction: string;
    archiveLocation: string | null;
    regulatoryReference: string | null;
    notes: string | null;
    isDefault: boolean;
    createdAt: string;
  }[]>`
    SELECT
      schedule_id           AS "scheduleId",
      category_id           AS "categoryId",
      jurisdiction          AS jurisdiction,
      trigger_event         AS "triggerEvent",
      trigger_custom_expr   AS "triggerCustomExpr",
      retention_period      AS "retentionPeriod",
      retention_unit        AS "retentionUnit",
      post_retention_action AS "postRetentionAction",
      archive_location      AS "archiveLocation",
      regulatory_reference  AS "regulatoryReference",
      notes                 AS notes,
      is_default            AS "isDefault",
      created_at            AS "createdAt"
    FROM bayanat.retention_schedules
    WHERE category_id = ${id}
    ORDER BY is_default DESC, jurisdiction, schedule_id
  `;

  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.categoryId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const {
    jurisdiction, triggerEvent, triggerCustomExpr, retentionPeriod,
    retentionUnit, postRetentionAction, archiveLocation,
    regulatoryReference, notes, isDefault,
  } = body;

  if (!jurisdiction || !triggerEvent || !retentionPeriod || !retentionUnit || !postRetentionAction) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [row] = await sql<{ scheduleId: number }[]>`
    INSERT INTO bayanat.retention_schedules (
      category_id, jurisdiction, trigger_event, trigger_custom_expr,
      retention_period, retention_unit, post_retention_action,
      archive_location, regulatory_reference, notes, is_default
    ) VALUES (
      ${id}, ${jurisdiction}, ${triggerEvent}, ${triggerCustomExpr ?? null},
      ${retentionPeriod}, ${retentionUnit}, ${postRetentionAction},
      ${archiveLocation ?? null}, ${regulatoryReference ?? null}, ${notes ?? null}, ${isDefault ?? false}
    )
    RETURNING schedule_id AS "scheduleId"
  `;

  return NextResponse.json({ scheduleId: row.scheduleId }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.categoryId);
  const { searchParams } = new URL(req.url);
  const scheduleId = Number(searchParams.get("scheduleId"));
  if (!Number.isFinite(scheduleId)) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });

  await sql`DELETE FROM bayanat.retention_schedules WHERE schedule_id = ${scheduleId} AND category_id = ${id}`;
  return NextResponse.json({ ok: true });
}
