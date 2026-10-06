import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { grantDomainRead } from "@/lib/can";
import { sql } from "@/lib/db";
import { getAccessRequestById, canApproveAccessRequest } from "@/lib/queries/access-requests";
import { createAssignment } from "@/lib/queries/admin";
import { createNotification } from "@/lib/queries/notifications";

const CATALOG_VIEW_ROLE_NAME = "Metadata Viewer";

// PATCH — approve or reject a PENDING request. Re-validates the approver
// check server-side (never trusts the client). On APPROVED, actually grants
// the access rather than just closing the ticket.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestId = Number(params.id);
  if (!Number.isFinite(requestId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const decision = body.decision as "APPROVED" | "REJECTED";
  const note = typeof body.note === "string" ? body.note : null;
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
  }

  const request = await getAccessRequestById(requestId);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.statusCode !== "PENDING") {
    return NextResponse.json({ error: "Request already decided" }, { status: 409 });
  }
  if (!(await canApproveAccessRequest(session, request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (decision === "APPROVED") {
    if (request.requestKind === "DOMAIN" && request.domainCode) {
      await grantDomainRead(request.domainCode, request.requesterUserId);
    } else if (request.requestKind === "CATALOG" && request.resourceType && request.resourceId != null) {
      const [role] = await sql<{ roleId: number }[]>`
        SELECT role_id AS "roleId" FROM bayanat.roles WHERE role_name = ${CATALOG_VIEW_ROLE_NAME}
      `;
      if (!role) return NextResponse.json({ error: "Metadata Viewer role not found" }, { status: 500 });
      await createAssignment({
        roleId: role.roleId,
        userId: request.requesterUserId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        resourceName: request.resourceName ?? request.resourceId,
      });
    }
  }

  await sql`
    UPDATE bayanat.access_requests
    SET status_code = ${decision}, decided_by_user_id = ${session.userId},
        decided_at = NOW(), decision_note_text = ${note}
    WHERE request_id = ${requestId}
  `;

  const what = request.requestKind === "DOMAIN" ? `${(request.domainCode ?? "").replace(/_/g, " ").toLowerCase()} domain` : request.resourceName ?? "the requested asset";
  await createNotification({
    userId: request.requesterUserId, type: "WORKFLOW", severity: decision === "APPROVED" ? "SUCCESS" : "WARNING",
    title: decision === "APPROVED" ? `Access approved: ${what}` : `Access request declined: ${what}`,
    body: `${decision === "APPROVED" ? "Approved" : "Declined"} by ${session.fullName}.${note ? ` Note: ${note}` : ""}`,
    actionLabel: "My requests", actionHref: "/request-access?tab=mine",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
