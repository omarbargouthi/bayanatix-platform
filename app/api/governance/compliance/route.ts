import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { listFrameworks, createFramework } from "@/lib/queries/gov-compliance";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listFrameworks());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, code, version, description, assessmentMode, regulationGroupCode } = await req.json();
  if (!name || !code) return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  if (assessmentMode && assessmentMode !== "COMPLIANCE_ONLY" && assessmentMode !== "MATURITY") {
    return NextResponse.json({ error: "assessmentMode must be COMPLIANCE_ONLY or MATURITY" }, { status: 400 });
  }
  try {
    const id = await createFramework(
      name, String(code).trim().toUpperCase().replace(/\s+/g, "_"), version ?? null, description ?? null,
      assessmentMode ?? "COMPLIANCE_ONLY", regulationGroupCode ?? null,
    );
    return NextResponse.json({ frameworkId: id }, { status: 201 });
  } catch (e) {
    // Most likely cause: the (framework code) UNIQUE constraint.
    return NextResponse.json({ error: `Could not create framework — code may already be in use (${(e as Error).message})` }, { status: 400 });
  }
}
