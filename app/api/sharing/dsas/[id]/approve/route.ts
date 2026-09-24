import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { nextStatusAfterApproval, STATUS_TO_STATION } from "@/lib/sharing-routing";

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

  const [dsaBefore] = await sql`SELECT status_code FROM bayanat.data_sharing_agreements WHERE dsa_id = ${dsaId}`;
  if (!dsaBefore) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activeStation = STATUS_TO_STATION[dsaBefore.status_code];
  if (!activeStation) {
    return NextResponse.json({ error: `No approval station is currently active (DSA status: ${dsaBefore.status_code}).` }, { status: 409 });
  }

  // Each station maps to a stakeholder role: DATA_OWNER means the OWNER on any
  // of this DSA's shared entities (same asset_stakeholders model as
  // GovernancePanel); the other three are org-wide roles held the same way, on
  // any asset. ADMIN always bypasses. If nobody is registered in that role at
  // all, the station is treated as open rather than a permanent dead-end,
  // matching the convention used by the generic workflow engine.
  if (session.role !== "ADMIN") {
    const STATION_ROLE_CODE: Record<string, string> = {
      DATA_OWNER: "OWNER", DATA_PRIVACY: "DATA_PRIVACY_OFFICER", DMO_REVIEW: "DMO_HEAD", EXEC_DELEGATE: "EXEC_DELEGATE",
    };
    const roleCode = STATION_ROLE_CODE[activeStation];
    const [{ cnt: totalHolders }] = await sql<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt FROM bayanat.asset_stakeholders WHERE role_code = ${roleCode}
    `;
    if (totalHolders > 0) {
      const [{ cnt: isHolder }] = await sql<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt FROM bayanat.asset_stakeholders s
        WHERE s.role_code = ${roleCode} AND s.user_id = ${session.userId}
          AND (
            ${roleCode} != 'OWNER'
            OR EXISTS (
              SELECT 1 FROM bayanat.dsa_datasets dd
              WHERE dd.dsa_id = ${dsaId} AND dd.entity_id = s.asset_id AND s.asset_type_code = 'DATA_ENTITIES'
            )
          )
      `;
      if (isHolder === 0) {
        return NextResponse.json({ error: "You are not authorized to decide at this approval station." }, { status: 403 });
      }
    }
  }

  // Record the decision — only the station matching the DSA's current status may be decided,
  // so approvals execute strictly in sequence like the Open Data workflow.
  const [updated] = await sql`
    UPDATE bayanat.dsa_approvals SET
      decision_code         = ${decision},
      approver_user_id      = ${session.userId},
      decision_timestamp    = NOW(),
      comments_text         = ${comments || null},
      delegation_evidence_ref = ${delegationEvidenceRef || null}
    WHERE approval_id = ${approvalId} AND dsa_id = ${dsaId} AND decision_code = 'PENDING'
      AND station_code = ${activeStation}
    RETURNING station_code AS "stationCode"
  `;

  if (!updated) {
    return NextResponse.json({ error: "This approval station is not active yet — approvals must be decided in order." }, { status: 409 });
  }

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
