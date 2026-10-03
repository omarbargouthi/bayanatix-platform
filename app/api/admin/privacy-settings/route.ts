import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logUpdate } from "@/lib/audit";
import {
  getPolicySettings, updateRetentionSettings, updateConsentSettings, getConsentStats, type RetentionSettings,
} from "@/lib/privacy/policy-settings";

// GET — retention periods + consent notice settings + who has accepted (admin only).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [settings, consentStats] = await Promise.all([getPolicySettings(), getConsentStats()]);
  return NextResponse.json({ settings, consentStats });
}

const days = (v: unknown): number | null | "invalid" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 36500 ? n : "invalid";
};

// PUT — { retention?: {...days or null}, consent?: { enabled, titleEn, textEn, titleAr, textAr, requireReacceptance } }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const before = await getPolicySettings();

  if (body.retention) {
    const keys: (keyof RetentionSettings)[] = ["auditLogDays", "dataAccessLogDays", "jobLogDays", "notificationDays", "dqSampleDays"];
    const next = {} as RetentionSettings;
    for (const k of keys) {
      const v = days(body.retention[k]);
      if (v === "invalid") return NextResponse.json({ error: "Retention periods must be whole days between 1 and 36500, or empty to keep forever" }, { status: 400 });
      next[k] = v;
    }
    await updateRetentionSettings(next, session.userId);
    await logUpdate("PLATFORM_SETTINGS", 1, session.userId, keys
      .filter((k) => before[k] !== next[k])
      .map((k) => ({ field: `retention.${k}`, oldVal: before[k] == null ? "forever" : String(before[k]), newVal: next[k] == null ? "forever" : String(next[k]) })),
    ).catch(() => {});
  }

  if (body.consent) {
    const c = body.consent;
    if (c.enabled && (!String(c.textEn ?? "").trim() || !String(c.titleEn ?? "").trim())) {
      return NextResponse.json({ error: "The English title and text are required to switch the consent notice on" }, { status: 400 });
    }
    await updateConsentSettings({
      enabled: !!c.enabled, titleEn: String(c.titleEn ?? ""), textEn: String(c.textEn ?? ""),
      titleAr: String(c.titleAr ?? ""), textAr: String(c.textAr ?? ""), requireReacceptance: !!c.requireReacceptance,
    }, session.userId);
    await logUpdate("PLATFORM_SETTINGS", 1, session.userId, [
      { field: "consent.enabled", oldVal: String(before.consentEnabled), newVal: String(!!c.enabled) },
      ...(c.requireReacceptance ? [{ field: "consent.version", oldVal: String(before.consentVersion), newVal: String(before.consentVersion + 1) }] : []),
    ]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
