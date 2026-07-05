import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export type ColumnDqRule = {
  ruleId:        number;
  ruleName:      string;
  dimensionCode: string | null;
  dimensionName: string | null;
  severity:      string;
  lastStatus:    string | null;
  lastScore:     number | null;
  lastRunAt:     string | null;
};

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const attributeId = Number(searchParams.get("attributeId"));
  if (!attributeId) return NextResponse.json({ error: "attributeId required" }, { status: 400 });

  const rows = await sql<ColumnDqRule[]>`
    SELECT
      r.rule_id                             AS "ruleId",
      r.rule_name_text                      AS "ruleName",
      r.dimension_code                      AS "dimensionCode",
      d.dimension_name_text                 AS "dimensionName",
      r.severity_level_code                 AS "severity",
      r.last_status_code                    AS "lastStatus",
      r.last_score                          AS "lastScore",
      to_char(r.last_run_at, 'YYYY-MM-DD HH24:MI') AS "lastRunAt"
    FROM bayanat.dq_rules r
    LEFT JOIN bayanat.dq_dimensions d ON d.dimension_code = r.dimension_code
    WHERE r.asset_type_code = 'DATA_ATTRIBUTES'
      AND r.asset_id        = ${attributeId}
      AND r.is_active_indicator = true
    ORDER BY r.rule_id
  `;

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      ruleId:    Number(r.ruleId),
      lastScore: r.lastScore != null ? Number(r.lastScore) : null,
    })),
  );
}
