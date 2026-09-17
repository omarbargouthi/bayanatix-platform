import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setDisabledNotificationTypes } from "@/lib/queries/users";
import { NOTIFICATION_TYPE_CODES } from "@/lib/notification-types";

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { disabledTypes } = (await req.json()) as { disabledTypes?: string[] };
  if (!Array.isArray(disabledTypes) || disabledTypes.some((t) => !NOTIFICATION_TYPE_CODES.includes(t))) {
    return NextResponse.json({ error: "Invalid notification type in list" }, { status: 400 });
  }

  await setDisabledNotificationTypes(session.userId, disabledTypes);
  return NextResponse.json({ ok: true, disabledTypes });
}
