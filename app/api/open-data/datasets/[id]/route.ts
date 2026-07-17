import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOpenDataset } from "@/lib/queries/open-data";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getOpenDataset(Number(params.id));
  if (!dataset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(dataset);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);

  // Verify ownership or admin
  const [row] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy" FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.raisedBy !== session.userId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  await sql`
    UPDATE bayanat.open_datasets SET
      dataset_name_text    = COALESCE(${body.datasetName   ?? null}, dataset_name_text),
      description_text     = ${body.descriptionText  ?? null},
      department_text      = ${body.departmentText   ?? null},
      category_id          = ${body.categoryId != null ? Number(body.categoryId) : null},
      purpose_text         = ${body.purposeText      ?? null},
      beneficiary_segments = COALESCE(${body.beneficiarySegments != null ? JSON.stringify(body.beneficiarySegments) : null}::jsonb, beneficiary_segments),
      publish_date         = ${body.publishDate      ?? null},
      coverage_from_year   = ${body.coverageFromYear != null ? Number(body.coverageFromYear) : null},
      coverage_to_year     = ${body.coverageToYear   != null ? Number(body.coverageToYear)   : null},
      data_formats         = COALESCE(${body.dataFormats != null ? JSON.stringify(body.dataFormats) : null}::jsonb, data_formats),
      data_size_text       = ${body.dataSizeText     ?? null},
      refresh_frequency    = ${body.refreshFrequency ?? null},
      dq_notes_text        = ${body.dqNotesText      ?? null},
      extraction_logic     = ${body.extractionLogic  ?? null},
      updated_at           = NOW()
    WHERE dataset_id = ${datasetId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);

  const [row] = await sql<{ raisedBy: string; status: string }[]>`
    SELECT raised_by_user_id AS "raisedBy", status_code AS "status"
    FROM bayanat.open_datasets
    WHERE dataset_id = ${datasetId} AND deleted_at IS NULL
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (row.status === "PUBLISHED") {
    // Retracting a published dataset: change to PENDING for re-review, not a hard delete
    await sql`
      UPDATE bayanat.open_datasets
      SET status_code = 'PENDING', updated_at = NOW()
      WHERE dataset_id = ${datasetId}
    `;
    return NextResponse.json({ ok: true, action: "retracted", newStatus: "PENDING" });
  }

  if (row.status === "PENDING_APPROVAL" || row.status === "APPROVED") {
    return NextResponse.json({ error: "Cannot delete a dataset that is pending approval or approved. Reject the workflow first." }, { status: 409 });
  }

  // DRAFT or PENDING: soft delete
  await sql`
    UPDATE bayanat.open_datasets
    SET deleted_at = NOW(), deleted_by = ${session.userId}
    WHERE dataset_id = ${datasetId}
  `;
  return NextResponse.json({ ok: true, action: "deleted" });
}
