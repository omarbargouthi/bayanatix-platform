import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export type EndpointHit = { typeCode: string; id: number; name: string; sublabel: string | null };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const types = (searchParams.get("types") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const q = (searchParams.get("q") ?? "").trim();
  const like = `%${q}%`;

  const hits: EndpointHit[] = [];

  for (const typeCode of types) {
    if (typeCode === "DATA_SOURCES") {
      const rows = await sql<{ id: number; name: string }[]>`
        SELECT data_source_id AS id, source_name_text AS name FROM bayanat.data_sources
        WHERE ${q === "" ? sql`true` : sql`source_name_text ILIKE ${like}`}
        ORDER BY source_name_text LIMIT 20
      `;
      hits.push(...rows.map((r) => ({ typeCode, id: r.id, name: r.name, sublabel: null })));
    } else if (typeCode === "DATA_SCHEMAS") {
      const rows = await sql<{ id: number; name: string; source: string }[]>`
        SELECT s.schema_id AS id, s.schema_name_text AS name, ds.source_name_text AS source
        FROM bayanat.data_schemas s JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
        WHERE ${q === "" ? sql`true` : sql`s.schema_name_text ILIKE ${like}`}
        ORDER BY s.schema_name_text LIMIT 20
      `;
      hits.push(...rows.map((r) => ({ typeCode, id: r.id, name: r.name, sublabel: r.source })));
    } else if (typeCode === "DATA_ENTITIES") {
      const rows = await sql<{ id: number; name: string; schema: string }[]>`
        SELECT e.entity_id AS id, e.entity_name_text AS name, s.schema_name_text AS schema
        FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
        WHERE ${q === "" ? sql`true` : sql`e.entity_name_text ILIKE ${like}`}
        ORDER BY e.entity_name_text LIMIT 20
      `;
      hits.push(...rows.map((r) => ({ typeCode, id: r.id, name: r.name, sublabel: r.schema })));
    } else if (typeCode === "DATA_ATTRIBUTES") {
      const rows = await sql<{ id: number; name: string; entity: string }[]>`
        SELECT a.attribute_id AS id, a.physical_name_text AS name, e.entity_name_text AS entity
        FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE ${q === "" ? sql`true` : sql`a.physical_name_text ILIKE ${like}`}
        ORDER BY a.physical_name_text LIMIT 20
      `;
      hits.push(...rows.map((r) => ({ typeCode, id: r.id, name: r.name, sublabel: r.entity })));
    } else if (typeCode.startsWith("CUSTOM:")) {
      const code = typeCode.slice("CUSTOM:".length);
      const rows = await sql<{ id: number; name: string }[]>`
        SELECT ca.custom_asset_id AS id, ca.asset_name_text AS name
        FROM bayanat.custom_assets ca JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
        WHERE t.type_code = ${code}
          AND (${q === "" ? sql`true` : sql`ca.asset_name_text ILIKE ${like}`})
        ORDER BY ca.asset_name_text LIMIT 20
      `;
      hits.push(...rows.map((r) => ({ typeCode, id: r.id, name: r.name, sublabel: null })));
    }
  }

  return NextResponse.json(hits);
}
