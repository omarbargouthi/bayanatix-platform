import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPolicySettings, needsConsent, recordConsent } from "@/lib/privacy/policy-settings";

// POST { decision: "ACCEPTED" | "DECLINED" } — the signed-in user's decision on the
// current consent notice. Recorded with time, IP and browser as evidence.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { decision } = await req.json().catch(() => ({}));
  if (decision !== "ACCEPTED" && decision !== "DECLINED") return NextResponse.json({ error: "decision must be ACCEPTED or DECLINED" }, { status: 400 });

  const settings = await getPolicySettings();
  if (!settings.consentEnabled) return NextResponse.json({ ok: true, required: false });

  await recordConsent({
    userId: session.userId, version: settings.consentVersion, decision,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true, required: await needsConsent(session.userId) });
}
