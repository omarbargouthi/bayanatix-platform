import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { listDsas } from "@/lib/queries/sharing";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const result = await listDsas({
    status: searchParams.get("status") ?? undefined,
    scope:  searchParams.get("scope")  ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page:   Number(searchParams.get("page") ?? 1),
    limit:  Number(searchParams.get("limit") ?? 20),
    userId: session.userId,
    userRole: session.role,
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.titleText?.trim()) {
    return NextResponse.json({ error: "titleText is required" }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO bayanat.data_sharing_agreements
      (title_text, sharing_scope_code, direction_code, created_by)
    VALUES (
      ${body.titleText.trim()},
      ${body.sharingScopeCode ?? "INTERNAL"},
      ${body.directionCode ?? "PROVIDER"},
      ${session.userId}
    )
    RETURNING dsa_id AS "dsaId"
  `;

  return NextResponse.json({ dsaId: Number(rows[0].dsaId) }, { status: 201 });
}
