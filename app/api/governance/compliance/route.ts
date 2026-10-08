import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canManageDomain } from "@/lib/can";
import { listFrameworks, createFramework, updateRegulationDetails } from "@/lib/queries/gov-compliance";
import { parseRegulationInput } from "@/lib/regulation-input";

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
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { name, code, version, description, assessmentMode, regulationGroupCode } = body as Record<string, string | undefined>;
  if (!name || !code) return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  if (assessmentMode && assessmentMode !== "COMPLIANCE_ONLY" && assessmentMode !== "MATURITY") {
    return NextResponse.json({ error: "assessmentMode must be COMPLIANCE_ONLY or MATURITY" }, { status: 400 });
  }
  // The registration details the form sends along (region, regulatory body, dates, links).
  const parsed = parseRegulationInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const id = await createFramework(
      name.trim(), String(code).trim().toUpperCase().replace(/\s+/g, "_"), version?.trim() || null, description?.trim() || null,
      (assessmentMode as "COMPLIANCE_ONLY" | "MATURITY" | undefined) ?? "COMPLIANCE_ONLY", regulationGroupCode ?? null, { userId: session.userId },
    );
    const { name: _n, version: _v, description: _d, assessmentMode: _m, ...details } = parsed.patch;
    void _n; void _v; void _d; void _m;
    if (Object.keys(details).length > 0) await updateRegulationDetails(id, details, session.userId);
    return NextResponse.json({ frameworkId: id }, { status: 201 });
  } catch (e) {
    // Most likely cause: the (framework code) UNIQUE constraint.
    return NextResponse.json({ error: `Could not create framework — code may already be in use (${(e as Error).message})` }, { status: 400 });
  }
}
