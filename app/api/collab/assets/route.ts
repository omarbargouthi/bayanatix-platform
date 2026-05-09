import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const level    = searchParams.get("level") ?? "sources";
  const parentId = searchParams.get("parentId") ?? "";

  switch (level) {
    case "sources": {
      const rows = await sql<{ id: number; label: string }[]>`
        SELECT data_source_id AS id, source_name_text AS label
        FROM bayanat.data_sources ORDER BY source_name_text
      `;
      return NextResponse.json(rows.map((r) => ({
        id: String(r.id), label: r.label, assetType: "DATA_SOURCE", hasChildren: true,
      })));
    }

    case "schemas": {
      const rows = await sql<{ id: number; label: string }[]>`
        SELECT schema_id AS id, schema_name_text AS label
        FROM bayanat.data_schemas
        WHERE data_source_id = ${Number(parentId)}
        ORDER BY schema_name_text
      `;
      return NextResponse.json(rows.map((r) => ({
        id: String(r.id), label: r.label, assetType: "SCHEMA", hasChildren: true,
      })));
    }

    case "tables": {
      const rows = await sql<{ id: number; label: string }[]>`
        SELECT entity_id AS id, entity_name_text AS label
        FROM bayanat.data_entities
        WHERE schema_id = ${Number(parentId)}
        ORDER BY entity_name_text
      `;
      return NextResponse.json(rows.map((r) => ({
        id: String(r.id), label: r.label, assetType: "TABLE", hasChildren: true,
      })));
    }

    case "columns": {
      const rows = await sql<{ id: number; label: string }[]>`
        SELECT attribute_id AS id, physical_name_text AS label
        FROM bayanat.data_attributes
        WHERE entity_id = ${Number(parentId)}
        ORDER BY attribute_id
      `;
      return NextResponse.json(rows.map((r) => ({
        id: String(r.id), label: r.label, assetType: "COLUMN", hasChildren: false,
      })));
    }

    case "glossary_domains": {
      const rows = await sql<{ id: number; label: string }[]>`
        SELECT glossary_id AS id, term_name_text AS label
        FROM bayanat.business_glossaries
        WHERE parent_glossary_id IS NULL
        ORDER BY term_name_text
      `;
      return NextResponse.json(rows.map((r) => ({
        id: String(r.id), label: r.label, assetType: "GLOSSARY_DOMAIN", hasChildren: true,
      })));
    }

    case "glossary_terms": {
      const rows = await sql<{ id: number; label: string }[]>`
        SELECT glossary_id AS id, term_name_text AS label
        FROM bayanat.business_glossaries
        WHERE parent_glossary_id = ${Number(parentId)}
        ORDER BY term_name_text
      `;
      return NextResponse.json(rows.map((r) => ({
        id: String(r.id), label: r.label, assetType: "GLOSSARY_TERM", hasChildren: false,
      })));
    }

    case "users": {
      const q = searchParams.get("q") ?? "";
      const rows = await sql<{ id: string; label: string; role: string }[]>`
        SELECT user_id AS id, full_name AS label, role
        FROM bayanat.users
        WHERE is_active = TRUE
          AND (${q} = '' OR lower(full_name) LIKE lower(${"%" + q + "%"}))
        ORDER BY full_name
      `;
      return NextResponse.json(rows.map((r) => ({
        id: r.id, label: r.label, role: r.role, assetType: "USER", hasChildren: false,
      })));
    }

    default:
      return NextResponse.json({ error: "Unknown level" }, { status: 400 });
  }
}
