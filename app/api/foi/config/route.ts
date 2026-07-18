import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getFoiConfig, getRejectionGrounds } from "@/lib/queries/foi";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [config, grounds] = await Promise.all([getFoiConfig(), getRejectionGrounds()]);
  return NextResponse.json({ config, grounds });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowed = [
    'foi_daily_rate_sar', 'foi_sla_business_days',
    'foi_appeal_window_days', 'foi_review_fee_sar', 'foi_quote_validity_days',
  ];

  for (const key of allowed) {
    if (body[key] != null) {
      await sql`
        INSERT INTO bayanat.system_config (key, value) VALUES (${key}, ${String(body[key])})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
  }

  return NextResponse.json({ ok: true });
}
