import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessDomain, canCreateDqRule } from "@/lib/can";
import { getDqRules, createDqRule } from "@/lib/queries/dq";

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const assetTypeCode = sp.get("assetTypeCode") ?? undefined;
  const assetId   = sp.get("assetId")   ? Number(sp.get("assetId"))   : undefined;
  const entityId  = sp.get("entityId")  ? Number(sp.get("entityId"))  : undefined;
  const activeOnly = sp.get("activeOnly") === "true";

  // Scoped to a specific asset (Catalog's per-table DQ tab, which stays open) —
  // no domain check needed. Unscoped is the platform-wide rule list (the
  // Data Quality domain dashboard), which does need it.
  if (assetId == null && entityId == null && !(await canAccessDomain(user, "DATA_QUALITY"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rules = await getDqRules({ assetTypeCode, assetId, entityId, activeOnly });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!(await canCreateDqRule(user, body.assetTypeCode, Number(body.assetId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
