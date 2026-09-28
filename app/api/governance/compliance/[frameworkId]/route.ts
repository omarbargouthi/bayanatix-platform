import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain } from "@/lib/can";
import { getFramework, listRequirements } from "@/lib/queries/gov-compliance";

export async function GET(_req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const fwId = Number(params.frameworkId);
  const [framework, requirements] = await Promise.all([getFramework(fwId), listRequirements(fwId)]);
  if (!framework) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ framework, requirements });
}
