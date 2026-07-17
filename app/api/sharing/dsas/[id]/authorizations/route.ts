import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  const body  = await req.json();

  if (!body.controllerNameText || !body.evidenceDocumentRef) {
    return NextResponse.json({ error: "controllerNameText and evidenceDocumentRef are required" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO bayanat.dsa_authorizations
      (dsa_id, controller_name_text, scope_text, evidence_document_ref, issued_date, valid_until_date)
    VALUES (
      ${dsaId},
      ${body.controllerNameText},
      ${body.scopeText || null},
      ${body.evidenceDocumentRef},
      ${body.issuedDate || null},
      ${body.validUntilDate || null}
    )
    RETURNING authorization_id AS "authorizationId"
  `;

  return NextResponse.json({ authorizationId: Number(row.authorizationId) }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  const { searchParams } = new URL(req.url);
  const authId = Number(searchParams.get("authId"));

  await sql`DELETE FROM bayanat.dsa_authorizations WHERE authorization_id = ${authId} AND dsa_id = ${dsaId}`;
  return NextResponse.json({ ok: true });
}
