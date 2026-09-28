import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canCreateDqRule } from "@/lib/can";
import { getDqRuleById, updateDqRule, deleteDqRule, getDqResults } from "@/lib/queries/dq";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ruleId = Number(params.id);
  const [rule, results] = await Promise.all([
    getDqRuleById(ruleId),
    getDqResults(ruleId, 30),
  ]);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rule, results });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ruleId = Number(params.id);
  const rule = await getDqRuleById(ruleId);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canCreateDqRule(user, rule.assetTypeCode, rule.assetId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  await updateDqRule(ruleId, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ruleId = Number(params.id);
  const rule = await getDqRuleById(ruleId);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canCreateDqRule(user, rule.assetTypeCode, rule.assetId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteDqRule(ruleId);
  return NextResponse.json({ ok: true });
}
