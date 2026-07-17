import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getDsaAttributes } from "@/lib/queries/sharing";

type Ctx = { params: { id: string } };

// POST /api/sharing/dsas/[id]/datasets — add a dataset to a DSA
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  if (!Number.isFinite(dsaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  if (!body.entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const [cur] = await sql`SELECT status_code FROM bayanat.data_sharing_agreements WHERE dsa_id = ${dsaId}`;
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["DRAFT","RENEWAL_DRAFT"].includes(cur.status_code)) {
    return NextResponse.json({ error: "DSA is not editable" }, { status: 409 });
  }

  const [row] = await sql`
    INSERT INTO bayanat.dsa_datasets (dsa_id, entity_id, filter_criteria_text)
    VALUES (${dsaId}, ${Number(body.entityId)}, ${body.filterCriteriaText || null})
    ON CONFLICT (dsa_id, entity_id) DO UPDATE SET filter_criteria_text = EXCLUDED.filter_criteria_text
    RETURNING dsa_dataset_id AS "dsaDatasetId"
  `;

  // If attributeIds provided, bulk-insert them
  if (Array.isArray(body.attributeIds) && body.attributeIds.length > 0) {
    const dsaDatasetId = Number(row.dsaDatasetId);
    for (const attrId of body.attributeIds as number[]) {
      await sql`
        INSERT INTO bayanat.dsa_attributes (dsa_dataset_id, attribute_id)
        VALUES (${dsaDatasetId}, ${attrId})
        ON CONFLICT (dsa_dataset_id, attribute_id) DO NOTHING
      `;
    }
  }

  return NextResponse.json({ dsaDatasetId: Number(row.dsaDatasetId) }, { status: 201 });
}

// DELETE /api/sharing/dsas/[id]/datasets?dsaDatasetId=X
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  const { searchParams } = new URL(req.url);
  const dsaDatasetId = Number(searchParams.get("dsaDatasetId"));
  if (!Number.isFinite(dsaDatasetId)) return NextResponse.json({ error: "dsaDatasetId required" }, { status: 400 });

  await sql`DELETE FROM bayanat.dsa_datasets WHERE dsa_dataset_id = ${dsaDatasetId} AND dsa_id = ${dsaId}`;
  return NextResponse.json({ ok: true });
}

// GET /api/sharing/dsas/[id]/datasets?dsaDatasetId=X — get attributes for one dataset
export async function GET(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dsaDatasetId = Number(searchParams.get("dsaDatasetId"));
  if (!Number.isFinite(dsaDatasetId)) return NextResponse.json({ error: "dsaDatasetId required" }, { status: 400 });

  const attributes = await getDsaAttributes(dsaDatasetId);
  return NextResponse.json(attributes);
}
