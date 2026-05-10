import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUnreadCount } from "@/lib/queries/workflow";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ unread: 0 });
  const unread = await getUnreadCount(session.userId);
  return NextResponse.json({ unread });
}
