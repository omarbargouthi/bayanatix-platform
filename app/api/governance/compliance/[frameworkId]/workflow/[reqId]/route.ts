import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWorkflow, advanceWorkflow } from "@/lib/queries/gov-compliance";
import { sql } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflow = await getWorkflow(Number(params.reqId));
  return NextResponse.json({ workflow });
}

async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
  label: string,
  href: string
) {
  try {
    await sql`
      INSERT INTO bayanat.notifications
        (user_id, type, title, body, severity, action_label, action_href)
      VALUES (${userId}, ${type}, ${title}, ${body}, 'INFO', ${label}, ${href})
    `;
  } catch (err) {
    console.warn("[compliance workflow] notification failed:", err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  if (!["submit", "confirm", "endorse"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Use submit | confirm | endorse" }, { status: 400 });
  }

  const reqId  = Number(params.reqId);
  const fwId   = Number(params.frameworkId);
  const byName = session.fullName ?? session.userId;

  await advanceWorkflow(reqId, fwId, action as "submit" | "confirm" | "endorse", byName);

  // Requirement info for the notifications
  const [reqInfo] = await sql<{ reqCode: string; domain: string | null }[]>`
    SELECT req_code AS "reqCode", domain
    FROM bayanat.gov_compliance_requirements WHERE req_id = ${reqId}
  `;
  const code   = reqInfo?.reqCode ?? String(reqId);
  const domain = reqInfo?.domain  ?? "";
  const href   = `/governance/compliance?fw=${fwId}`;

  if (action === "submit") {
    // Confirmation to the submitter themselves
    await notify(
      session.userId, "COMPLIANCE",
      `Evidence submitted: ${code}`,
      `Your evidence item ${code} (${domain}) has been submitted for review.`,
      "View", href
    );
    // Notify STEWARD + ADMIN users (next reviewers), excluding submitter
    const reviewers = await sql<{ user_id: string }[]>`
      SELECT user_id FROM bayanat.users
      WHERE is_active = true AND role IN ('STEWARD','ADMIN') AND user_id != ${session.userId}
    `;
    for (const u of reviewers) {
      await notify(
        u.user_id, "COMPLIANCE",
        `Compliance evidence needs review: ${code}`,
        `${byName} submitted evidence ${code} (${domain}) — please review and confirm.`,
        "Review", href
      );
    }
  } else if (action === "confirm") {
    // Confirmation to the confirmer
    await notify(
      session.userId, "COMPLIANCE",
      `Evidence confirmed: ${code}`,
      `You confirmed evidence item ${code} (${domain}). Pending endorsement.`,
      "View", href
    );
    // Notify ADMIN users for endorsement
    const admins = await sql<{ user_id: string }[]>`
      SELECT user_id FROM bayanat.users
      WHERE is_active = true AND role = 'ADMIN' AND user_id != ${session.userId}
    `;
    for (const a of admins) {
      await notify(
        a.user_id, "COMPLIANCE",
        `Compliance evidence ready for endorsement: ${code}`,
        `${byName} confirmed evidence ${code} (${domain}) — please endorse.`,
        "Endorse", href
      );
    }
  } else if (action === "endorse") {
    // Confirmation to the endorser
    await notify(
      session.userId, "COMPLIANCE",
      `Evidence endorsed: ${code}`,
      `You endorsed evidence item ${code} (${domain}). Process complete.`,
      "View", href
    );
    // Notify ALL active users involved (STEWARD + OFFICER)
    const others = await sql<{ user_id: string }[]>`
      SELECT user_id FROM bayanat.users
      WHERE is_active = true AND role IN ('STEWARD','OFFICER') AND user_id != ${session.userId}
    `;
    for (const u of others) {
      await notify(
        u.user_id, "COMPLIANCE",
        `Evidence endorsed: ${code}`,
        `Evidence item ${code} (${domain}) has been fully endorsed by ${byName}.`,
        "View", href
      );
    }
  }

  return NextResponse.json({ ok: true });
}
