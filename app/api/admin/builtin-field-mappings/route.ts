import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  BUILTIN_FIELDS, listBuiltinFieldMappings, saveBuiltinFieldMapping, getEmptySourceMode, setEmptySourceMode,
  EMPTY_SOURCE_MODES, type BuiltinFieldMapping, type EmptySourceMode,
} from "@/lib/source-builtin-fields";

// Which source property / comment key feeds each built-in field (table type, column
// type, friendly name, encrypted) during a crawl — see lib/source-builtin-fields.ts.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ fields: BUILTIN_FIELDS, mappings: await listBuiltinFieldMappings(), emptySourceMode: await getEmptySourceMode() });
}

// What a crawl does with a mapped field when the source has no value for it.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { emptySourceMode } = (await req.json().catch(() => ({}))) as { emptySourceMode?: EmptySourceMode };
  if (!emptySourceMode || !EMPTY_SOURCE_MODES.includes(emptySourceMode)) return NextResponse.json({ error: "emptySourceMode must be KEEP, CLEAR_SYNCED or CLEAR_ALWAYS" }, { status: 400 });
  await setEmptySourceMode(emptySourceMode, session.userId);
  return NextResponse.json({ emptySourceMode });
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
