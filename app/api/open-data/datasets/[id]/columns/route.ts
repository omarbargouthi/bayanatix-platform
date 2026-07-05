import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getDatasetColumns } from "@/lib/queries/open-data";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const columns = await getDatasetColumns(Number(params.id));
  return NextResponse.json(columns);
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);

  // Verify access
  const [ds] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy" FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { attributeId: number; publishName?: string; publishDesc?: string; sortOrder?: number } = await req.json();

  const [row] = await sql<{ odColumnId: number }[]>`
    INSERT INTO bayanat.open_dataset_columns
      (dataset_id, attribute_id, publish_name, publish_desc, sort_order)
    VALUES
      (${datasetId}, ${body.attributeId}, ${body.publishName ?? null}, ${body.publishDesc ?? null}, ${body.sortOrder ?? 0})
    ON CONFLICT (dataset_id, attribute_id) DO UPDATE
      SET publish_name = EXCLUDED.publish_name,
          publish_desc = EXCLUDED.publish_desc
    RETURNING od_column_id AS "odColumnId"
  `;

  await sql`UPDATE bayanat.open_datasets SET updated_at = NOW() WHERE dataset_id = ${datasetId}`;

  return NextResponse.json({ odColumnId: Number(row.odColumnId) }, { status: 201 });
}
