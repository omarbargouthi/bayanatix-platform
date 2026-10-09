import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEFAULT_TABLE_TYPE_CONFIG, validateTableTypeConfig } from "@/lib/table-type-rules";
import { getTableTypeConfig, saveTableTypeConfig, rescoreTableTypes } from "@/lib/queries/table-type-rules";

// The rules a crawl uses to suggest a table's type — see lib/table-type-rules.ts.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ config: await getTableTypeConfig(), defaults: DEFAULT_TABLE_TYPE_CONFIG });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const checked = validateTableTypeConfig(body?.config);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  await saveTableTypeConfig(checked.config, session.userId);
  return NextResponse.json({ config: checked.config });
}

// Scores the tables already in the catalog. { config, apply: false } previews what the
// rules on screen would change without saving anything; { apply: true } applies the
// saved rules to every table whose type no steward has confirmed.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const apply = body?.apply === true;
  let config = await getTableTypeConfig();
  if (!apply && body?.config) {
    const checked = validateTableTypeConfig(body.config);
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    config = checked.config;
  }
  const result = await rescoreTableTypes(config, apply);
  return NextResponse.json({ ...result, changes: result.changes.slice(0, 200), applied: apply });
}
