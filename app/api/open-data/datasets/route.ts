import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { listOpenDatasets } from "@/lib/queries/open-data";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all";
  const search = searchParams.get("search") ?? "";
  const page   = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit  = Math.min(50, Math.max(10, Number(searchParams.get("limit") ?? "20")));
  const mine   = searchParams.get("mine") === "1";

  const result = await listOpenDatasets({
    userId: mine ? session.userId : undefined,
    status,
    search,
    page,
    limit,
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = (body.datasetName as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "datasetName is required" }, { status: 400 });

  const [row] = await sql<{ datasetId: number }[]>`
    INSERT INTO bayanat.open_datasets (
      dataset_name_text,
      description_text,
      department_text,
      category_text,
      purpose_text,
      beneficiary_segments,
      publish_date,
      coverage_from_year,
      coverage_to_year,
      data_formats,
      data_size_text,
      refresh_frequency,
      dq_notes_text,
      extraction_logic,
      raised_by_user_id
    ) VALUES (
      ${name},
      ${body.descriptionText ?? null},
      ${body.departmentText  ?? null},
      ${body.categoryText    ?? null},
      ${body.purposeText     ?? null},
      ${JSON.stringify(body.beneficiarySegments ?? [])},
      ${body.publishDate    ?? null},
      ${body.coverageFromYear != null ? Number(body.coverageFromYear) : null},
      ${body.coverageToYear   != null ? Number(body.coverageToYear)   : null},
      ${JSON.stringify(body.dataFormats ?? [])},
      ${body.dataSizeText    ?? null},
      ${body.refreshFrequency ?? null},
      ${body.dqNotesText     ?? null},
      ${body.extractionLogic ?? null},
      ${session.userId}
    )
    RETURNING dataset_id AS "datasetId"
  `;

  return NextResponse.json({ datasetId: Number(row.datasetId) }, { status: 201 });
}
