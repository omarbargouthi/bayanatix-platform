import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string; colId: string } };

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId  = Number(params.id);
  const odColumnId = Number(params.colId);

  const [ds] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy" FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await sql`
    DELETE FROM bayanat.open_dataset_columns WHERE od_column_id = ${odColumnId} AND dataset_id = ${datasetId}
  `;

  await sql`UPDATE bayanat.open_datasets SET updated_at = NOW() WHERE dataset_id = ${datasetId}`;

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId  = Number(params.id);
  const odColumnId = Number(params.colId);

  const [ds] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy" FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { publishName?: string | null; publishDesc?: string | null } = await req.json();

  await sql`
    UPDATE bayanat.open_dataset_columns
    SET publish_name = ${body.publishName ?? null},
        publish_desc = ${body.publishDesc ?? null}
    WHERE od_column_id = ${odColumnId} AND dataset_id = ${datasetId}
  `;

  return NextResponse.json({ ok: true });
}
