import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCrawlJobLogs } from "@/lib/queries/crawl-jobs";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await getCrawlJobLogs(Number(params.id));
  return NextResponse.json(logs);
}
