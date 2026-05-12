import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runDqRule } from "@/lib/dq-engine";
import { getDqRules } from "@/lib/queries/dq";

// POST /api/dq/run  { ruleId?: number, assetTypeCode?: string, assetId?: number }
// If ruleId is provided, runs that rule. Otherwise runs all active rules for the asset.
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

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
