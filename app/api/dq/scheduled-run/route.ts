import { NextResponse } from "next/server";
import { runDqRule } from "@/lib/dq-engine";
import { getDqRules } from "@/lib/queries/dq";
import { isScheduleDue } from "@/lib/scheduler-utils";

// Hit by a node-cron tick (Authorization: Bearer CRON_SECRET — same convention as
// /api/admin/sources/scheduled-crawl and /api/lineage/pbix/scheduled-scan).
// dq_rules.schedule_cron + last_run_at have existed since migration 020 (and the
// rule editor already lets you set a cron expression), but nothing ever actually
// executed a rule on its schedule until this route — runDqRule() already updates
// last_run_at on every run, so no query-layer change was needed on the DQ side.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await getDqRules({ activeOnly: true });
  const due = rules.filter(r => isScheduleDue(r.scheduleCron, r.lastRunAt));

  const results = await Promise.allSettled(due.map(r => runDqRule(r.ruleId)));
  const output = results.map((r, i) =>
    r.status === "fulfilled"
      ? { ruleName: due[i].ruleName, ...r.value }
      : { ruleId: due[i].ruleId, ruleName: due[i].ruleName, statusCode: "ERROR", message: String((r as PromiseRejectedResult).reason) }
  );

  return NextResponse.json({ candidates: rules.filter(r => !!r.scheduleCron).length, due: due.length, results: output });
}
