import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { assetType: string; assetId: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await sql<{ certDimension: string; certTypeCode: string; certifiedBy: string | null; certDate: string | null; notes: string | null }[]>`
    SELECT
      cert_dimension AS "certDimension",
      cert_type_code AS "certTypeCode",
      certified_by_user_id AS "certifiedBy",
      certification_date::text AS "certDate",
      certification_notes_text AS "notes"
    FROM bayanat.asset_certifications
    WHERE asset_type_code = ${params.assetType} AND asset_id = ${Number(params.assetId)}
    ORDER BY cert_dimension, certification_date DESC
  `;
  const result: Record<string, { certTypeCode: string; certifiedBy: string | null; certDate: string | null; notes: string | null }> = {};
  for (const r of rows) {
    if (!result[r.certDimension]) result[r.certDimension] = r;
  }
  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dimension, certTypeCode, notes } = await req.json();
  if (!["METADATA", "DATA"].includes(dimension))
    return NextResponse.json({ error: "dimension must be METADATA or DATA" }, { status: 400 });
  if (!["GOLD", "SILVER", "BRONZE"].includes(certTypeCode))
    return NextResponse.json({ error: "certTypeCode must be GOLD, SILVER, or BRONZE" }, { status: 400 });

  await sql`
    INSERT INTO bayanat.asset_certifications
      (asset_type_code, asset_id, cert_type_code, certified_by_user_id, certification_date, certification_notes_text, cert_dimension)
    VALUES
      (${params.assetType}, ${Number(params.assetId)}, ${certTypeCode}, ${session.userId}, CURRENT_DATE, ${notes || null}, ${dimension})
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dimension } = await req.json();
  await sql`
    DELETE FROM bayanat.asset_certifications
    WHERE asset_type_code=${params.assetType} AND asset_id=${Number(params.assetId)}
      AND cert_dimension=${dimension}
  `;
  return NextResponse.json({ ok: true });
}
