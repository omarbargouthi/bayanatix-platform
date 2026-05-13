import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDqRules, createDqRule } from "@/lib/queries/dq";

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const assetTypeCode = sp.get("assetTypeCode") ?? undefined;
  const assetId   = sp.get("assetId")   ? Number(sp.get("assetId"))   : undefined;
  const entityId  = sp.get("entityId")  ? Number(sp.get("entityId"))  : undefined;
  const activeOnly = sp.get("activeOnly") === "true";

  const rules = await getDqRules({ assetTypeCode, assetId, entityId, activeOnly });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const ruleId = await createDqRule({
    ruleName:         body.ruleName,
    dimensionCode:    body.dimensionCode ?? null,
    assetTypeCode:    body.assetTypeCode,
    assetId:          Number(body.assetId),
    ruleTemplateCode: body.ruleTemplateCode ?? null,
    ruleConfig:       body.ruleConfig ?? {},
    ruleDefinitionText: body.ruleDefinitionText ?? "",
    severityLevelCode:  body.severityLevelCode ?? "WARNING",
    thresholdWarn:    body.thresholdWarn != null ? Number(body.thresholdWarn) : null,
    thresholdFail:    body.thresholdFail != null ? Number(body.thresholdFail) : null,
    scheduleCron:     body.scheduleCron ?? null,
    notifyOwners:     Boolean(body.notifyOwners),
    openIssueOnFail:  Boolean(body.openIssueOnFail),
  });
  return NextResponse.json({ ruleId }, { status: 201 });
}
