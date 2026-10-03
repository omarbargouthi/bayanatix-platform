import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerT } from "@/lib/i18n/server";
import { buildDsrManifest, updateDsr, refreshDsrItems, notifyDsrOwners } from "@/lib/privacy/dsr";
import { buildDsrWorkbook } from "@/lib/privacy/dsr-export";

type Ctx = { params: { id: string } };
const canView = (role: string) => role === "ADMIN" || role === "OFFICER" || role === "STEWARD";
const canManage = (role: string) => role === "ADMIN" || role === "OFFICER";

// GET — the request's manifest (tables on the retention path, PI columns, actions,
// locate queries, legal holds, downstream copies). ?format=xlsx | json downloads it.
export async function GET(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const m = await buildDsrManifest(Number(params.id));
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format");
  if (format === "xlsx") {
    const buf = await buildDsrWorkbook(m, await getServerT(session));
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${m.request.referenceCode}.xlsx"`,
      },
    });
  }
  if (format === "json") {
    return new NextResponse(JSON.stringify(m, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${m.request.referenceCode}.json"` },
    });
  }
  return NextResponse.json({ ...m, canManage: canManage(session.role) });
}

// PATCH { action: COMPLETE | REJECT | EXTEND | REOPEN | REFRESH | NOTIFY, responseSummary?, reason?, newDueDate?, notes? }
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden — admin or data protection officer only" }, { status: 403 });
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  if (b.action === "REFRESH") { await refreshDsrItems(id); return NextResponse.json({ ok: true }); }
  if (b.action === "NOTIFY") return NextResponse.json({ ok: true, notified: await notifyDsrOwners(id, session.userId) });
  const res = await updateDsr(id, { action: b.action, responseSummary: b.responseSummary, reason: b.reason, newDueDate: b.newDueDate, notes: b.notes }, session.userId);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
