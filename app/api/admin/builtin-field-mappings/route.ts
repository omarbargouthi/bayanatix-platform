import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { BUILTIN_FIELDS, listBuiltinFieldMappings, saveBuiltinFieldMapping, type BuiltinFieldMapping } from "@/lib/source-builtin-fields";

// Which source property / comment key feeds each built-in field (table type, column
// type, friendly name, encrypted) during a crawl — see lib/source-builtin-fields.ts.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ fields: BUILTIN_FIELDS, mappings: await listBuiltinFieldMappings() });
}

// One field for one source type; an empty sourceKey removes the mapping.
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Partial<BuiltinFieldMapping>;
  try {
    await saveBuiltinFieldMapping({
      fieldCode: body.fieldCode as BuiltinFieldMapping["fieldCode"], sourceTypeCode: String(body.sourceTypeCode ?? ""),
      methodCode: (body.methodCode ?? "COMMENT_KEY") as BuiltinFieldMapping["methodCode"], sourceKey: String(body.sourceKey ?? ""),
    }, session.userId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ mappings: await listBuiltinFieldMappings() });
}
