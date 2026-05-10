import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCrawlConfig, saveCrawlConfig } from "@/lib/queries/sources";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = await getCrawlConfig(Number(params.id));
  return NextResponse.json(cfg);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  await saveCrawlConfig(Number(params.id), {
    schemaIncludeList:    body.schemaIncludeList    ?? null,
    schemaExcludeList:    body.schemaExcludeList    ?? [],
    tableExcludePatterns: body.tableExcludePatterns ?? [],
    profilingEnabled:     !!body.profilingEnabled,
    profilingMode:        body.profilingMode        ?? "TOP_N",
    profilingLimit:       Number(body.profilingLimit ?? 1000),
  });
  return NextResponse.json({ ok: true });
}