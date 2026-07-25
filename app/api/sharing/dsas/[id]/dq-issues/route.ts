import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

async function checkEditable(dsaId: number, userId: string, role: string) {
  const [cur] = await sql<{ statusCode: string; createdBy: string }[]>`
    SELECT status_code AS "statusCode", created_by AS "createdBy"
    FROM bayanat.data_sharing_agreements WHERE dsa_id = ${dsaId}
  `;
  if (!cur) return "not_found";
  if (!["DRAFT","RENEWAL_DRAFT"].includes(cur.statusCode)) return "not_editable";
  if (cur.createdBy !== userId && role !== "ADMIN" && role !== "STEWARD") return "forbidden";
  return "ok";
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  if (!Number.isFinite(dsaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const status = await checkEditable(dsaId, session.userId, session.role);
  if (status === "not_found")    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status === "not_editable") return NextResponse.json({ error: "DSA is not editable in its current status" }, { status: 409 });
  if (status === "forbidden")    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: {
    attributeId:   number;
    dimensionCode?: string | null;
    issueText:     string;
    severityCode?: "BLOCKER" | "WARNING" | "INFO";
  } = await req.json();

  if (!body.attributeId) return NextResponse.json({ error: "attributeId is required" }, { status: 400 });
  if (!body.issueText?.trim()) return NextResponse.json({ error: "issueText is required" }, { status: 400 });

  const [row] = await sql<{ issueId: number }[]>`
    INSERT INTO bayanat.dsa_dataset_dq_issues
      (dsa_id, attribute_id, dimension_code, issue_text, severity_code, created_by_user_id)
    VALUES
      (${dsaId}, ${body.attributeId}, ${body.dimensionCode ?? null},
       ${body.issueText.trim()}, ${body.severityCode ?? "WARNING"}, ${session.userId})
    RETURNING issue_id AS "issueId"
  `;

  return NextResponse.json({ issueId: Number(row.issueId) }, { status: 201 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  if (!Number.isFinite(dsaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const status = await checkEditable(dsaId, session.userId, session.role);
  if (status === "not_found")    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status === "not_editable") return NextResponse.json({ error: "DSA is not editable in its current status" }, { status: 409 });
  if (status === "forbidden")    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: {
    issueId:       number;
    dimensionCode?: string | null;
    issueText?:    string;
    severityCode?: "BLOCKER" | "WARNING" | "INFO";
  } = await req.json();

  if (!body.issueId) return NextResponse.json({ error: "issueId required" }, { status: 400 });

  await sql`
    UPDATE bayanat.dsa_dataset_dq_issues
    SET
      dimension_code = COALESCE(${body.dimensionCode !== undefined ? (body.dimensionCode ?? null) : null}, dimension_code),
      issue_text     = COALESCE(${body.issueText?.trim() ?? null}, issue_text),
      severity_code  = COALESCE(${body.severityCode ?? null}, severity_code)
    WHERE issue_id = ${body.issueId} AND dsa_id = ${dsaId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  if (!Number.isFinite(dsaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const issueId = Number(searchParams.get("issueId"));
  if (!issueId) return NextResponse.json({ error: "issueId required" }, { status: 400 });

  const status = await checkEditable(dsaId, session.userId, session.role);
  if (status === "not_found")    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status === "not_editable") return NextResponse.json({ error: "DSA is not editable in its current status" }, { status: 409 });
  if (status === "forbidden")    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sql`DELETE FROM bayanat.dsa_dataset_dq_issues WHERE issue_id = ${issueId} AND dsa_id = ${dsaId}`;

  return NextResponse.json({ ok: true });
}
