import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getComplianceWorkflowStatus, submitComplianceReview } from "@/lib/queries/gov-compliance";
import { advanceWorkflow } from "@/lib/workflow";
import { sql } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflow = await getComplianceWorkflowStatus(Number(params.reqId));
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
  if (!["submit", "confirm", "endorse", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Use submit | confirm | endorse | reject" }, { status: 400 });
  }

  const reqId  = Number(params.reqId);
  const fwId   = Number(params.frameworkId);
  const byName = session.fullName ?? session.userId;

  // Role gating — was UI-only before this route was rewritten; now enforced server-side.
  if (action === "submit" && session.role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((action === "confirm" || (action === "reject")) && !["ADMIN", "STEWARD"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (action === "endorse" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (action === "submit") {
      await submitComplianceReview(reqId, session.userId);
    } else {
      const [row] = await sql<{ requestId: number | null; title: string; currentStageOrder: number | null }[]>`
        SELECT r.review_request_id AS "requestId", ar.title,
               ws.stage_order AS "currentStageOrder"
        FROM bayanat.gov_compliance_requirements r
        JOIN bayanat.asset_requests ar ON ar.request_id = r.review_request_id
        LEFT JOIN bayanat.workflow_instances wi ON wi.request_id = ar.request_id AND wi.status_code = 'ACTIVE'
        LEFT JOIN bayanat.workflow_stages ws ON ws.stage_id = wi.current_stage_id
        WHERE r.req_id = ${reqId}
      `;
      if (!row?.requestId) return NextResponse.json({ error: "No submitted review to act on" }, { status: 400 });

      if (action === "reject") {
        if (session.role === "STEWARD" && row.currentStageOrder !== 1) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await advanceWorkflow(row.requestId, session.userId, row.title, "REJECTED");
      } else {
        const expectedOrder = action === "confirm" ? 1 : 2;
        if (row.currentStageOrder !== expectedOrder) {
          return NextResponse.json({ error: `Cannot ${action} — review is not at that stage` }, { status: 400 });
        }
        await advanceWorkflow(row.requestId, session.userId, row.title, "APPROVED");
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Workflow action failed" }, { status: 400 });
  }

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
  } else if (action === "reject") {
    await notify(
      session.userId, "COMPLIANCE",
      `Evidence rejected: ${code}`,
      `You rejected evidence item ${code} (${domain}). The submitter can resubmit.`,
      "View", href
    );
  }

  return NextResponse.json({ ok: true });
}
