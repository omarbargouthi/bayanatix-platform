import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canCreateDqRule } from "@/lib/can";
import { runDqRule } from "@/lib/dq-engine";
import { getDqRules, getDqRuleById } from "@/lib/queries/dq";

// POST /api/dq/run  { ruleId?: number, assetTypeCode?: string, assetId?: number }
// If ruleId is provided, runs that rule. Otherwise runs all active rules for the asset.
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Same permission as creating/editing a DQ rule: the Data Quality domain
  // role, or being an effective steward of the rule's (or given) asset.
  if (body.ruleId) {
    const rule = await getDqRuleById(Number(body.ruleId));
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canCreateDqRule(user, rule.assetTypeCode, rule.assetId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!(await canCreateDqRule(user, body.assetTypeCode, body.assetId ? Number(body.assetId) : NaN))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.ruleId) {
    try {
      const result = await runDqRule(Number(body.ruleId));
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({
        ruleId: body.ruleId,
        statusCode: "ERROR",
        message: String(err),
        score: null,
      });
    }
  }

  // Run all active rules for asset
  const rules = await getDqRules({
    assetTypeCode: body.assetTypeCode,
    assetId:       body.assetId ? Number(body.assetId) : undefined,
    activeOnly:    true,
  });

  const results = await Promise.allSettled(rules.map((r) => runDqRule(r.ruleId)));
  const output = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { ruleId: rules[i].ruleId, statusCode: "ERROR", message: String((r as PromiseRejectedResult).reason) }
  );
  return NextResponse.json(output);
}
