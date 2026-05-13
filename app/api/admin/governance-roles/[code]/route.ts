import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateGovernanceRoleLabel } from "@/lib/queries/governance-config";

const EDITABLE = new Set(["OWNER", "BIZ_STEWARD", "TECH_STEWARD"]);

type Params = { params: { code: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = params.code.toUpperCase();
  if (!EDITABLE.has(code)) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await updateGovernanceRoleLabel(code, name.trim(), description?.trim() || null);
  return NextResponse.json({ ok: true });
}
