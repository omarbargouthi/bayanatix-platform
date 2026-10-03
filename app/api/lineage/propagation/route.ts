import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPropagations } from "@/lib/lineage/propagation-queries";
import { runPropagation } from "@/lib/lineage/propagation";
import { createJob, finishJob, failJob } from "@/lib/queries/background-jobs";

const FIELDS = ["CLASSIFICATION", "BUSINESS_TERM", "DESCRIPTION", "TAG", "RETENTION"];

// GET — the propagation queue (?view=SUGGESTED), what was applied automatically
// (?view=APPLIED), or decided/replaced items (?view=HISTORY).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const view = (["SUGGESTED", "APPLIED", "HISTORY"].includes(sp.get("view") ?? "") ? sp.get("view") : "SUGGESTED") as "SUGGESTED" | "APPLIED" | "HISTORY";
  const field = FIELDS.includes(sp.get("field") ?? "") ? sp.get("field")! : undefined;
  return NextResponse.json(await listPropagations({ view, field, q: sp.get("q") ?? "", page: Number(sp.get("page") ?? 1) }));
}

// POST — run propagation now, as a background job (Job Logs + completion notification).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });

  const jobId = await createJob("LINEAGE_PROPAGATION", null, session.userId);
  void (async () => {
    const lines: string[] = [`Lineage propagation — ${new Date().toISOString()}`];
    try {
      const summary = await runPropagation({ log: (m) => { lines.push(m); } });
      await finishJob(jobId, { resultJson: summary, logFileData: Buffer.from(lines.join("\n") + "\n", "utf-8") });
    } catch (e) {
      await failJob(jobId, (e as Error).message, Buffer.from(lines.join("\n") + "\n", "utf-8"));
    }
  })();
  return NextResponse.json({ jobId }, { status: 202 });
}
