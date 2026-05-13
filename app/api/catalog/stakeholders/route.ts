import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStakeholders, assignStakeholder } from "@/lib/queries/stakeholders";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetTypeCode = searchParams.get("assetType") ?? "";
  const assetId       = Number(searchParams.get("assetId"));
  if (!assetTypeCode || !assetId) return NextResponse.json({ error: "Missing assetType or assetId" }, { status: 400 });

  return NextResponse.json(await getStakeholders(assetTypeCode, assetId));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assetTypeCode, assetId, userId, roleCode } = body;
  if (!assetTypeCode || !assetId || !userId || !roleCode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate user exists
  const [user] = await sql<{ fullName: string | null; email: string }[]>`
    SELECT full_name AS "fullName", email FROM bayanat.users WHERE user_id = ${userId} AND is_active = true
  `;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const assignmentId = await assignStakeholder(assetTypeCode, Number(assetId), userId, roleCode);

  // Notify the assigned user (for steward/custodian assignments)
  if (roleCode !== "OWNER") {
    const assetLabel = assetTypeCode === "DATA_ENTITIES" ? "table" : "column";
    await sql`
      INSERT INTO bayanat.notifications
        (user_id, type, title, body, severity, action_label, action_href)
      VALUES
        (${userId}, 'WORKFLOW',
         ${`You have been assigned as ${roleCode.replace("_", " ").toLowerCase()} on a ${assetLabel}`},
         ${`${session.fullName} assigned you as ${roleCode.replace("_", " ")} for asset #${assetId}`},
         'INFO', 'View Asset',
         ${assetTypeCode === "DATA_ENTITIES" ? `/catalog/0/tables/${assetId}` : `/catalog`})
    `;
  }

  return NextResponse.json({ assignmentId });
}
