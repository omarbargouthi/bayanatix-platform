import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logUpdate } from "@/lib/audit";
import { buildConsentRegisterWorkbook } from "@/lib/privacy/consent-register";

// GET — the consent register as Excel (admin only), same filters as the register
// (&q= &version= &decision=). The file holds IP addresses, so each export is audited.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const decision = sp.get("decision");
  const buf = await buildConsentRegisterWorkbook({
    q: sp.get("q") ?? "",
    version: Number(sp.get("version")) || null,
    decision: decision === "ACCEPTED" || decision === "DECLINED" ? decision : null,
  });
  await logUpdate("PLATFORM_SETTINGS", 1, session.userId, [
    { field: "consent.registerExported", oldVal: "", newVal: new URL(req.url).search || "all" },
  ]).catch(() => {});
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="consent-register-${stamp}.xlsx"`,
    },
  });
}
