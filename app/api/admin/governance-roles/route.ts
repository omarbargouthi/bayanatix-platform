import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGovernanceRoleLabels } from "@/lib/queries/governance-config";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const labels = await getGovernanceRoleLabels();
  return NextResponse.json(Object.values(labels));
}
