import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEFAULT_COLUMN_TYPE_CONFIG, validateColumnTypeConfig } from "@/lib/column-classifier";
import { getColumnTypeConfig } from "@/lib/classification-runner";
import { saveColumnTypeConfig, restoreDefaultColumnPatterns, rescoreColumnTypes } from "@/lib/queries/column-type-rules";

// The rules that suggest whether a column is Business or Technical — see
// lib/column-classifier.ts. The name patterns have their own API (/api/classification/patterns).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ config: await getColumnTypeConfig(), defaults: DEFAULT_COLUMN_TYPE_CONFIG });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const checked = validateColumnTypeConfig(body?.config);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  await saveColumnTypeConfig(checked.config, session.userId);
  return NextResponse.json({ config: checked.config });
}

// { action: "restorePatterns" } puts the default name patterns back.
// { config, apply: false } previews the rules on screen against the catalog, writing nothing.
// { apply: true } runs a classification over every data source with the saved rules.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);

  if (body?.action === "restorePatterns") return NextResponse.json(await restoreDefaultColumnPatterns());

  const apply = body?.apply === true;
  let config = undefined;
  if (!apply && body?.config) {
    const checked = validateColumnTypeConfig(body.config);
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    config = checked.config;
  }
  try {
    const result = await rescoreColumnTypes({ config, apply, userId: session.userId });
    return NextResponse.json({ ...result, changes: result.changes.slice(0, 200), applied: apply });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
