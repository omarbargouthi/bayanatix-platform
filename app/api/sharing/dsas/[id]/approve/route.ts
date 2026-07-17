import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { nextStatusAfterApproval } from "@/lib/sharing-routing";

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  const body  = await req.json();
  const { approvalId, decision, comments, delegationEvidenceRef } = body;

  if (!["APPROVED","REJECTED","RETURNED"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  if ((decision === "REJECTED" || decision === "RETURNED") && !comments?.trim()) {
    return NextResponse.json({ error: "Comments required for rejection/return" }, { status: 400 });
  }

  // Record the decision
  const [updated] = await sql`
    UPDATE bayanat.dsa_approvals SET
      decision_code         = ${decision},
      approver_user_id      = ${session.userId},
      decision_timestamp    = NOW(),
      comments_text         = ${comments || null},
      delegation_evidence_ref = ${delegationEvidenceRef || null}
    WHERE approval_id = ${approvalId} AND dsa_id = ${dsaId} AND decision_code = 'PENDING'
    RETURNING station_code AS "stationCode"
  `;

  if (!updated) return NextResponse.json({ error: "Approval not found or already decided" }, { status: 404 });

  // Compute next DSA status
  const [dsa] = await sql`SELECT status_code FROM bayanat.data_sharing_agreements WHERE dsa_id = ${dsaId}`;
  const allApprovals = await sql`
    SELECT station_code, decision_code, required_indicator FROM bayanat.dsa_approvals WHERE dsa_id = ${dsaId}
  `;

  const nextStatus = nextStatusAfterApproval(
    dsa.status_code,
    decision as "APPROVED" | "REJECTED" | "RETURNED",
    updated.stationCode,
    allApprovals.map(a => ({
      stationCode: a.station_code as string,
      decisionCode: a.decision_code as string,
      requiredIndicator: a.required_indicator as boolean,
    })),
  );

  await sql`
    UPDATE bayanat.data_sharing_agreements SET
      status_code  = ${nextStatus},
      approved_at  = ${nextStatus === "APPROVED" ? sql`NOW()` : sql`approved_at`}
    WHERE dsa_id = ${dsaId}
  `;

  return NextResponse.json({ ok: true, nextStatus });
}
