import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveHomepageLayout } from "@/lib/queries/homepage";
import { ALL_WIDGET_KEYS } from "@/lib/homepage/widget-meta";

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { widgetKeys } = await req.json().catch(() => ({}));
  if (!Array.isArray(widgetKeys) || !widgetKeys.every((k) => typeof k === "string" && ALL_WIDGET_KEYS.includes(k))) {
    return NextResponse.json({ error: "widgetKeys must be an array of valid widget keys" }, { status: 400 });
  }

  await saveHomepageLayout(session.userId, widgetKeys);
  return NextResponse.json({ ok: true });
}
