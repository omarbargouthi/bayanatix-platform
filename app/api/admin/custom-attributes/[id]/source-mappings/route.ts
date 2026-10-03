import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setCustomAttributeSourceMappings } from "@/lib/queries/custom-attributes";
import type { CustomAttributeSourceMapping } from "@/lib/types";

type Params = { params: { id: string } };
const SOURCE_TYPES = ["MSSQL", "POSTGRES", "ORACLE", "MYSQL"];

// PUT — replace where crawls read this attribute's value from, per source type.
// Body: { mappings: [{ sourceTypeCode, methodCode, sourceKey }] } (omit a source type to unmap it).
export async function PUT(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const attrDefId = Number(params.id);
  const [def] = await sql<{ assetType: string }[]>`SELECT asset_type_code AS "assetType" FROM bayanat.custom_attribute_definitions WHERE attr_def_id = ${attrDefId}`;
  if (!def) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (def.assetType !== "DATA_ENTITIES" && def.assetType !== "DATA_ATTRIBUTES") {
    return NextResponse.json({ error: "Source mappings apply to table and column attributes only" }, { status: 400 });
  }

  const { mappings }: { mappings: CustomAttributeSourceMapping[] } = await req.json();
  const clean: CustomAttributeSourceMapping[] = [];
  const seen = new Set<string>();
  for (const m of mappings ?? []) {
    const key = (m.sourceKey ?? "").trim();
    if (!key) continue;
    if (!SOURCE_TYPES.includes(m.sourceTypeCode)) return NextResponse.json({ error: `Unknown source type ${m.sourceTypeCode}` }, { status: 400 });
    if (m.methodCode !== "COMMENT_KEY" && !(m.methodCode === "EXTENDED_PROPERTY" && m.sourceTypeCode === "MSSQL")) {
      return NextResponse.json({ error: "Extended properties exist on SQL Server only — use a comment key for other databases" }, { status: 400 });
    }
    if (m.methodCode === "COMMENT_KEY" && !/^[A-Za-z_][\w-]*$/.test(key)) {
      return NextResponse.json({ error: `Comment key "${key}" must be one word (letters, digits, _ or -)` }, { status: 400 });
    }
    if (key.length > 128) return NextResponse.json({ error: "Key is too long" }, { status: 400 });
    if (seen.has(m.sourceTypeCode)) continue;
    seen.add(m.sourceTypeCode);
    clean.push({ sourceTypeCode: m.sourceTypeCode, methodCode: m.methodCode, sourceKey: key });
  }

  await setCustomAttributeSourceMappings(attrDefId, clean, session.userId);
  return NextResponse.json({ ok: true, mappings: clean });
}
