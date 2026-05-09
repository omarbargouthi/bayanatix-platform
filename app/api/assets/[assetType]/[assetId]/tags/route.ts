import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { assetType: string; assetId: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await sql<{ tagId: number; tagName: string; colorHex: string; parentTagId: number | null }[]>`
    SELECT t.tag_id AS "tagId", t.tag_name AS "tagName", t.color_hex AS "colorHex", t.parent_tag_id AS "parentTagId"
    FROM bayanat.asset_tags at2
    JOIN bayanat.tags t ON t.tag_id = at2.tag_id
    WHERE at2.asset_type_code = ${params.assetType} AND at2.asset_id = ${Number(params.assetId)}
    ORDER BY t.tag_name
  `;
  return NextResponse.json(rows);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tagIds }: { tagIds: number[] } = await req.json();
  const assetType = params.assetType;
  const assetId   = Number(params.assetId);
  await sql`DELETE FROM bayanat.asset_tags WHERE asset_type_code=${assetType} AND asset_id=${assetId}`;
  for (const tagId of tagIds ?? []) {
    await sql`
      INSERT INTO bayanat.asset_tags (tag_id, asset_type_code, asset_id, assigned_by)
      VALUES (${tagId}, ${assetType}, ${assetId}, ${session.userId})
      ON CONFLICT DO NOTHING
    `;
  }
  return NextResponse.json({ ok: true });
}
