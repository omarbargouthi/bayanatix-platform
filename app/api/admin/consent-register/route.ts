import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getConsentSummary, listConsentDecisions, listConsentVersions, listPendingUsers, type DecisionFilter,
} from "@/lib/privacy/consent-register";

// GET — consent register (admin only).
//   ?view=decisions (default): &q= &version= &decision=ACCEPTED|DECLINED &page=
//   ?view=pending: active users who haven't accepted the current version (&q=)
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? "";
  const summary = await getConsentSummary();

  if (sp.get("view") === "pending") {
    return NextResponse.json({ summary, pending: await listPendingUsers(q) });
  }

  const decision = sp.get("decision");
  const filter: DecisionFilter = {
    q,
    version: Number(sp.get("version")) || null,
    decision: decision === "ACCEPTED" || decision === "DECLINED" ? decision : null,
  };
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const [versions, { rows, total }] = await Promise.all([listConsentVersions(), listConsentDecisions(filter, page)]);
  return NextResponse.json({ summary, versions, rows, total });
}
