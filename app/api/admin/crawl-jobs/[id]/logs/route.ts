import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCrawlJobLogs } from "@/lib/queries/crawl-jobs";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const logs = await getCrawlJobLogs(Number(params.id));
  return NextResponse.json(logs);
}
