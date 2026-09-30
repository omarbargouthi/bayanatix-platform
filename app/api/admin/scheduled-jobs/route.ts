import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listScheduledJobAreas, updateScheduledJobArea } from "@/lib/queries/scheduling";
import { isValidCronExpression } from "@/lib/scheduler-utils";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listScheduledJobAreas());
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { areaCode, scheduleCron, isEnabled } = body;
  if (typeof areaCode !== "string" || typeof scheduleCron !== "string" || typeof isEnabled !== "boolean") {
    return NextResponse.json({ error: "areaCode, scheduleCron, isEnabled are required" }, { status: 400 });
  }
  if (!isValidCronExpression(scheduleCron)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  await updateScheduledJobArea(areaCode, scheduleCron, isEnabled);
  return NextResponse.json(await listScheduledJobAreas());
}
