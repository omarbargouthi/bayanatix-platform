import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getNotifications, markAllRead } from "@/lib/queries/notifications";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await getNotifications(user.userId);
  return NextResponse.json(notifications);
}

export async function PATCH() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await markAllRead(user.userId);
  return NextResponse.json({ ok: true });
}
