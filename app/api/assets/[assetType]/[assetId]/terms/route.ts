import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { assetType: string; assetId: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await sql<{
    glossaryId: number; termName: string; domainName: string | null;
    isPii: boolean; termRole: string;
  }[]>`
    SELECT
      bg.glossary_id        AS "glossaryId",
      bg.term_name_text     AS "termName",
      p.term_name_text      AS "domainName",
      COALESCE(bg.is_pii_indicator, false) AS "isPii",
      abt.term_role         AS "termRole"
    FROM bayanat.asset_business_terms abt
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    LEFT JOIN bayanat.business_glossaries p ON p.glossary_id = bg.parent_glossary_id
    WHERE abt.asset_type_code = ${params.assetType} AND abt.asset_id = ${Number(params.assetId)}
    ORDER BY abt.term_role, bg.term_name_text
  `;
  return NextResponse.json(rows);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetType = params.assetType;
  const assetId   = Number(params.assetId);
  const body = await req.json();

  // Dual-mode: { classificationId, enrichmentIds }
  // Legacy single-mode: { glossaryIds } — all treated as ENRICHMENT
  if ("classificationId" in body || "enrichmentIds" in body) {
    const classificationId: number | null = body.classificationId ?? null;
    const enrichmentIds: number[]         = body.enrichmentIds ?? [];

    await sql`
      DELETE FROM bayanat.asset_business_terms
      WHERE asset_type_code = ${assetType} AND asset_id = ${assetId}
    `;

    if (classificationId != null) {
      await sql`
        INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role)
        VALUES (${classificationId}, ${assetType}, ${assetId}, ${session.userId}, 'CLASSIFICATION')
        ON CONFLICT DO NOTHING
      `;
    }
    for (const glossaryId of enrichmentIds) {
      await sql`
        INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role)
        VALUES (${glossaryId}, ${assetType}, ${assetId}, ${session.userId}, 'ENRICHMENT')
        ON CONFLICT DO NOTHING
      `;
    }
  } else {
    // Legacy path: glossaryIds array — all ENRICHMENT
    const { glossaryIds }: { glossaryIds: number[] } = body;
    await sql`
      DELETE FROM bayanat.asset_business_terms
      WHERE asset_type_code = ${assetType} AND asset_id = ${assetId}
    `;
    for (const glossaryId of glossaryIds ?? []) {
      await sql`
        INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role)
        VALUES (${glossaryId}, ${assetType}, ${assetId}, ${session.userId}, 'ENRICHMENT')
        ON CONFLICT DO NOTHING
      `;
    }
  }

  return NextResponse.json({ ok: true });
}
