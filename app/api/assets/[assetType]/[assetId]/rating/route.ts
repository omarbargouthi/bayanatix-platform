import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { assetType: string; assetId: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assetType = params.assetType;
  const assetId   = Number(params.assetId);

  const [agg, mine] = await Promise.all([
    sql<{ average: number | null; count: number }[]>`
      SELECT round(avg(stars)::numeric, 1) AS average, count(*)::int AS count
      FROM bayanat.asset_ratings
      WHERE asset_type_code=${assetType} AND asset_id=${assetId}
    `,
    sql<{ stars: number; comment: string | null }[]>`
      SELECT stars, comment FROM bayanat.asset_ratings
      WHERE asset_type_code=${assetType} AND asset_id=${assetId} AND user_id=${session.userId}
    `,
  ]);
  return NextResponse.json({
    average:  agg[0]?.average ?? null,
    count:    agg[0]?.count   ?? 0,
    myRating: mine[0] ?? null,
  });
}

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { stars, comment } = await req.json();
  if (!stars || stars < 1 || stars > 5) return NextResponse.json({ error: "stars must be 1-5" }, { status: 400 });
  const assetType = params.assetType;
  const assetId   = Number(params.assetId);
  await sql`
    INSERT INTO bayanat.asset_ratings (asset_type_code, asset_id, user_id, stars, comment, rated_at)
    VALUES (${assetType}, ${assetId}, ${session.userId}, ${stars}, ${comment ?? null}, NOW())
    ON CONFLICT (asset_type_code, asset_id, user_id)
    DO UPDATE SET stars=${stars}, comment=${comment ?? null}, rated_at=NOW()
  `;
  return NextResponse.json({ ok: true });
}
