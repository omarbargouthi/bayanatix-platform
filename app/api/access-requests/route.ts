import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { DomainCode } from "@/lib/can";
import { sql } from "@/lib/db";
import { CATALOG_RESOURCE_TYPES, canApproveAccessRequest, listAccessRequests, type CatalogResourceType } from "@/lib/queries/access-requests";

const ALL_DOMAINS: DomainCode[] = ["GOVERNANCE", "DATA_QUALITY", "DATA_PRIVACY", "SHARING", "FOI", "OPEN_DATA"];

// GET — { mine, pendingForMe }. `mine` is the caller's own requests (any
// status). `pendingForMe` is every PENDING request the caller is the
// authorized approver for (ADMIN sees all; otherwise domain managers see
// their domain's requests, data source owners see requests under their source).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await listAccessRequests();
  const mine = rows.filter((r) => r.requesterUserId === session.userId);
  const pending = rows.filter((r) => r.statusCode === "PENDING");
  const approveFlags = await Promise.all(pending.map((r) => canApproveAccessRequest(session, r)));
  const pendingForMe = pending.filter((_, i) => approveFlags[i]);

  return NextResponse.json({ mine, pendingForMe });
}

// POST — any logged-in user may file a request; no permission check beyond that.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const kind = body.kind as "DOMAIN" | "CATALOG";
  const justification = typeof body.justification === "string" ? body.justification : null;

  if (kind === "DOMAIN") {
    const domain = body.domain as DomainCode;
    if (!ALL_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
    }
    await sql`
      INSERT INTO bayanat.access_requests
        (requester_user_id, request_kind, domain_code, justification_text)
      VALUES (${session.userId}, 'DOMAIN', ${domain}, ${justification})
    `;
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (kind === "CATALOG") {
    const resourceType = body.resourceType as CatalogResourceType;
    const resourceId = String(body.resourceId ?? "");
    const resourceName = typeof body.resourceName === "string" ? body.resourceName : null;
    if (!CATALOG_RESOURCE_TYPES.includes(resourceType) || !resourceId) {
      return NextResponse.json({ error: "resourceType and resourceId are required" }, { status: 400 });
    }
    await sql`
      INSERT INTO bayanat.access_requests
        (requester_user_id, request_kind, resource_type, resource_id, resource_name, justification_text)
      VALUES (${session.userId}, 'CATALOG', ${resourceType}, ${resourceId}, ${resourceName}, ${justification})
    `;
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: "kind must be DOMAIN or CATALOG" }, { status: 400 });
}
