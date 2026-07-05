import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getDatasetDqIssues } from "@/lib/queries/open-data";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const issues = await getDatasetDqIssues(Number(params.id));
  return NextResponse.json(issues);
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);

  const [ds] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy" FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: {
    attributeId?: number | null;
    dimensionCode?: string | null;
    issueText: string;
    severityCode?: "BLOCKER" | "WARNING" | "INFO";
  } = await req.json();

  if (!body.issueText?.trim()) {
    return NextResponse.json({ error: "issueText is required" }, { status: 400 });
  }

  const [row] = await sql<{ issueId: number }[]>`
    INSERT INTO bayanat.open_dataset_dq_issues
      (dataset_id, attribute_id, dimension_code, issue_text, severity_code)
    VALUES
      (${datasetId}, ${body.attributeId ?? null}, ${body.dimensionCode ?? null},
       ${body.issueText.trim()}, ${body.severityCode ?? "WARNING"})
    RETURNING issue_id AS "issueId"
  `;

  return NextResponse.json({ issueId: Number(row.issueId) }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const datasetId = Number(params.id);
  const { searchParams } = new URL(req.url);
  const issueId = Number(searchParams.get("issueId"));

  if (!issueId) return NextResponse.json({ error: "issueId required" }, { status: 400 });

  const [ds] = await sql<{ raisedBy: string }[]>`
    SELECT raised_by_user_id AS "raisedBy" FROM bayanat.open_datasets WHERE dataset_id = ${datasetId}
  `;
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ds.raisedBy !== session.userId && session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await sql`DELETE FROM bayanat.open_dataset_dq_issues WHERE issue_id = ${issueId} AND dataset_id = ${datasetId}`;

  return NextResponse.json({ ok: true });
}
