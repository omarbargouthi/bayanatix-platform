import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getDsaAttributes } from "@/lib/queries/sharing";

type Ctx = { params: { id: string } };

async function checkEditable(dsaId: number) {
  const [cur] = await sql`SELECT status_code FROM bayanat.data_sharing_agreements WHERE dsa_id = ${dsaId}`;
  if (!cur) return "not_found";
  if (!["DRAFT","RENEWAL_DRAFT"].includes(cur.status_code)) return "not_editable";
  return "ok";
}

// POST — add OUTBOUND (catalog) or INBOUND (manual) dataset
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  if (!Number.isFinite(dsaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const status = await checkEditable(dsaId);
  if (status === "not_found")    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status === "not_editable") return NextResponse.json({ error: "DSA is not editable" }, { status: 409 });

  const body = await req.json();
  const direction = body.datasetDirection === "INBOUND" ? "INBOUND" : "OUTBOUND";

  if (direction === "OUTBOUND") {
    if (!body.entityId) return NextResponse.json({ error: "entityId required for outbound datasets" }, { status: 400 });

    const [row] = await sql`
      INSERT INTO bayanat.dsa_datasets (dsa_id, entity_id, filter_criteria_text, dataset_direction)
      VALUES (${dsaId}, ${Number(body.entityId)}, ${body.filterCriteriaText || null}, 'OUTBOUND')
      ON CONFLICT (dsa_id, entity_id) WHERE entity_id IS NOT NULL AND dataset_direction = 'OUTBOUND'
        DO UPDATE SET filter_criteria_text = EXCLUDED.filter_criteria_text
      RETURNING dsa_dataset_id AS "dsaDatasetId"
    `;

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

  // INBOUND
  if (!body.inboundNameText?.trim()) {
    return NextResponse.json({ error: "inboundNameText required for inbound datasets" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO bayanat.dsa_datasets
      (dsa_id, dataset_direction, inbound_name_text, inbound_description_text)
    VALUES (
      ${dsaId}, 'INBOUND',
      ${body.inboundNameText.trim()},
      ${body.inboundDescriptionText || null}
    )
    RETURNING dsa_dataset_id AS "dsaDatasetId"
  `;
  return NextResponse.json({ dsaDatasetId: Number(row.dsaDatasetId) }, { status: 201 });
}

// PATCH — assign catalog entity to an inbound dataset
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  const { searchParams } = new URL(req.url);
  const dsaDatasetId = Number(searchParams.get("dsaDatasetId"));
  if (!Number.isFinite(dsaDatasetId)) return NextResponse.json({ error: "dsaDatasetId required" }, { status: 400 });

  const body = await req.json();

  await sql`
    UPDATE bayanat.dsa_datasets SET
      inbound_entity_id        = ${body.inboundEntityId != null ? Number(body.inboundEntityId) : null},
      inbound_name_text        = COALESCE(${body.inboundNameText || null}, inbound_name_text),
      inbound_description_text = COALESCE(${body.inboundDescriptionText || null}, inbound_description_text),
      filter_criteria_text     = COALESCE(${body.filterCriteriaText || null}, filter_criteria_text)
    WHERE dsa_dataset_id = ${dsaDatasetId} AND dsa_id = ${dsaId}
  `;
  return NextResponse.json({ ok: true });
}

// DELETE — remove a dataset from the DSA
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

// GET — get attributes for one dataset
export async function GET(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dsaDatasetId = Number(searchParams.get("dsaDatasetId"));
  if (!Number.isFinite(dsaDatasetId)) return NextResponse.json({ error: "dsaDatasetId required" }, { status: 400 });

  const attributes = await getDsaAttributes(dsaDatasetId);
  return NextResponse.json(attributes);
}
