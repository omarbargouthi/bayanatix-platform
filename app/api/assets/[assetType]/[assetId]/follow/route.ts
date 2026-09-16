import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isFollowing, followAsset, unfollowAsset, getFollowSettings } from "@/lib/queries/follows";

type Params = { params: { assetType: string; assetId: string } };

// Schema/Source-level follows are gated behind an admin toggle (they fan out
// to every table/column beneath them, which can flood a follower's Homepage
// with activity) — Table-level follows are always allowed.
async function isLevelAllowed(assetType: string): Promise<boolean> {
  if (assetType !== "DATA_SCHEMAS" && assetType !== "DATA_SOURCES") return true;
  const settings = await getFollowSettings();
  return assetType === "DATA_SCHEMAS" ? settings.schemaFollowEnabled : settings.sourceFollowEnabled;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });

  const [following, allowed] = await Promise.all([
    isFollowing(session.userId, params.assetType, assetId),
    isLevelAllowed(params.assetType),
  ]);
  return NextResponse.json({ following, allowed });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });

  if (!(await isLevelAllowed(params.assetType))) {
    return NextResponse.json({ error: "Following this asset type is disabled by your admin" }, { status: 403 });
  }

  await followAsset(session.userId, params.assetType, assetId);
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });

  await unfollowAsset(session.userId, params.assetType, assetId);
  return NextResponse.json({ ok: true, following: false });
}
