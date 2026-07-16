import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

const VALID_METHODS = new Set([
  "AGE_BRACKET",
  "SALARY_BRACKET",
  "CITY_ONLY",
  "DATE_YEAR",
  "PSEUDONYMIZATION",
  "GENERALIZATION",
  "CUSTOM",
]);

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);

  const [ds] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy"
    FROM bayanat.open_datasets WHERE dataset_id = ${datasetId} AND deleted_at IS NULL
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { attributeId: number; method: string; notes?: string } = await req.json();
  const { attributeId, method, notes } = body;

  if (!attributeId || !method) return NextResponse.json({ error: "attributeId and method are required" }, { status: 400 });
  if (!VALID_METHODS.has(method)) return NextResponse.json({ error: "Invalid de-identification method" }, { status: 400 });
  if (method === "CUSTOM" && !notes?.trim()) {
    return NextResponse.json({ error: "A description is required for CUSTOM de-identification method" }, { status: 400 });
  }

  const [odCol] = await sql<{ odColumnId: number }[]>`
    SELECT od_column_id AS "odColumnId"
    FROM bayanat.open_dataset_columns
    WHERE dataset_id = ${datasetId} AND attribute_id = ${attributeId}
  `;
  if (!odCol) return NextResponse.json({ error: "Column not in this dataset" }, { status: 404 });

  await sql`
    UPDATE bayanat.open_dataset_columns
    SET deidentification_method = ${method},
        deidentification_notes  = ${notes?.trim() ?? null}
    WHERE od_column_id = ${odCol.odColumnId}
  `;

  await sql`UPDATE bayanat.open_datasets SET updated_at = NOW() WHERE dataset_id = ${datasetId}`;

  return NextResponse.json({ ok: true, method, notes: notes?.trim() ?? null });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);
  const { searchParams } = new URL(req.url);
  const attributeId = Number(searchParams.get("attributeId"));

  if (!attributeId) return NextResponse.json({ error: "attributeId required" }, { status: 400 });

  await sql`
    UPDATE bayanat.open_dataset_columns
    SET deidentification_method = NULL, deidentification_notes = NULL
    WHERE dataset_id = ${datasetId} AND attribute_id = ${attributeId}
  `;

  return NextResponse.json({ ok: true });
}
