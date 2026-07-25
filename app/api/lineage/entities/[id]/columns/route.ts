import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityId = Number(params.id);
  if (!Number.isFinite(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql<{ attributeId: number; name: string; qualityStatus: string }[]>`
    SELECT
      a.attribute_id AS "attributeId",
      a.physical_name_text AS name,
      CASE
        WHEN EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true AND r.severity_level_code = 'CRITICAL' AND r.last_status_code = 'FAILED')
          THEN 'CRITICAL'
        WHEN EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true AND r.severity_level_code = 'WARNING' AND r.last_status_code = 'FAILED')
          THEN 'WARNING'
        WHEN EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true)
          THEN 'GOOD'
        ELSE 'UNKNOWN'
      END AS "qualityStatus"
    FROM bayanat.data_attributes a
    WHERE a.entity_id = ${entityId}
    ORDER BY a.physical_name_text
  `;

  return NextResponse.json(rows.map((r) => ({ ...r, attributeId: Number(r.attributeId) })));
}
