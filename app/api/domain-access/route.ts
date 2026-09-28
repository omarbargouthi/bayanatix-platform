import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import type { DomainCode } from "@/lib/can";
import { sql } from "@/lib/db";

// Self-service delegation: a domain-write role holder (or ADMIN) can grant/
// revoke read-only access to their own domain(s) without needing the
// platform-admin-only /admin/roles screen. Deliberately a separate, narrower
// surface — every write here re-validates canManageDomain server-side rather
// than trusting the client's claimed domain.

const ALL_DOMAINS: DomainCode[] = ["GOVERNANCE", "DATA_QUALITY", "DATA_PRIVACY", "SHARING", "FOI", "OPEN_DATA"];

const READ_ROLE_NAME: Record<DomainCode, string> = {
  GOVERNANCE:    "Data Governance (Read)",
  DATA_QUALITY:  "Data Quality (Read)",
  DATA_PRIVACY:  "Data Privacy (Read)",
  SHARING:       "Open Data & Access (Read)",
  FOI:           "Open Data & Access (Read)",
  OPEN_DATA:     "Open Data & Access (Read)",
};

// GET — for every domain the caller manages, list current read-only grants.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const managed = await Promise.all(ALL_DOMAINS.map(async (d) => ({ domain: d, ok: await canManageDomain(session, d) })));
  const domains = managed.filter((m) => m.ok).map((m) => m.domain);
  if (domains.length === 0) return NextResponse.json({ domains: [] });

  const result = await Promise.all(domains.map(async (domain) => {
    const rows = await sql<{ userId: string; fullName: string | null; email: string | null }[]>`
      SELECT u.user_id AS "userId", u.full_name AS "fullName", u.email
      FROM bayanat.role_assignments ra
      JOIN bayanat.roles r ON r.role_id = ra.role_id
      JOIN bayanat.users u ON u.user_id = ra.user_id
      WHERE ra.resource_type = 'DOMAIN' AND ra.resource_id = ${domain} AND r.domain_read = true
      ORDER BY u.full_name
    `;
    return { domain, grants: rows };
  }));

  return NextResponse.json({ domains: result });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const domain = body.domain as DomainCode;
  const userId = String(body.userId ?? "");
  if (!ALL_DOMAINS.includes(domain) || !userId) {
    return NextResponse.json({ error: "domain and userId are required" }, { status: 400 });
  }
  if (!(await canManageDomain(session, domain))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [role] = await sql<{ roleId: number }[]>`
    SELECT role_id AS "roleId" FROM bayanat.roles WHERE role_name = ${READ_ROLE_NAME[domain]}
  `;
  if (!role) return NextResponse.json({ error: "Read role not found" }, { status: 500 });

  const existing = await sql<{ id: number }[]>`
    SELECT assignment_id AS id FROM bayanat.role_assignments
    WHERE role_id = ${role.roleId} AND resource_type = 'DOMAIN' AND resource_id = ${domain} AND user_id = ${userId}
  `;
  if (existing.length === 0) {
    await sql`
      INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_id, resource_name)
      VALUES (${role.roleId}, ${userId}, 'DOMAIN', ${domain}, ${domain})
    `;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const domain = body.domain as DomainCode;
  const userId = String(body.userId ?? "");
  if (!ALL_DOMAINS.includes(domain) || !userId) {
    return NextResponse.json({ error: "domain and userId are required" }, { status: 400 });
  }
  if (!(await canManageDomain(session, domain))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await sql`
    DELETE FROM bayanat.role_assignments ra
    USING bayanat.roles r
    WHERE ra.role_id = r.role_id AND r.role_name = ${READ_ROLE_NAME[domain]}
      AND ra.resource_type = 'DOMAIN' AND ra.resource_id = ${domain} AND ra.user_id = ${userId}
  `;
  return NextResponse.json({ ok: true });
}
