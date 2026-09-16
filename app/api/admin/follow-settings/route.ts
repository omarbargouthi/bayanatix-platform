import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFollowSettings, updateFollowSettings } from "@/lib/queries/follows";

// GET is open to any signed-in user — the Follow button on a schema/source
// page needs to know whether that level is enabled to render itself
// correctly, not just admins.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getFollowSettings());
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  await updateFollowSettings({
    schemaFollowEnabled: typeof body.schemaFollowEnabled === "boolean" ? body.schemaFollowEnabled : undefined,
    sourceFollowEnabled: typeof body.sourceFollowEnabled === "boolean" ? body.sourceFollowEnabled : undefined,
  });
  return NextResponse.json(await getFollowSettings());
}
