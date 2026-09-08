import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { translatedColumnSql } from "@/lib/i18n-admin/translated-column";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{
    categoryId: number;
    name: string;
    nameTranslations: Record<string, string> | null;
    parentId: number | null;
    sensitivity: string;
    description: string | null;
    descriptionTranslations: Record<string, string> | null;
    examples: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    scheduleCount: number;
    entityCount: number;
  }[]>`
    SELECT
      dc.category_id        AS "categoryId",
      dc.name               AS name,
      ${sql.unsafe(translatedColumnSql(`'data_categories.' || dc.category_id || '.name'`, "nameTranslations"))},
      dc.parent_id          AS "parentId",
      dc.sensitivity        AS sensitivity,
      dc.description        AS description,
      ${sql.unsafe(translatedColumnSql(`'data_categories.' || dc.category_id || '.description'`, "descriptionTranslations"))},
      dc.examples           AS examples,
      dc.sort_order         AS "sortOrder",
      dc.is_active          AS "isActive",
      dc.created_at         AS "createdAt",
      COUNT(DISTINCT rs.schedule_id)::int AS "scheduleCount",
      COUNT(DISTINCT de.entity_id)::int   AS "entityCount"
    FROM bayanat.data_categories dc
    LEFT JOIN bayanat.retention_schedules rs ON rs.category_id = dc.category_id
    LEFT JOIN bayanat.data_entities de ON de.retention_category_id = dc.category_id
    WHERE dc.is_active = true
    GROUP BY dc.category_id
    ORDER BY dc.parent_id NULLS FIRST, dc.sort_order, dc.name
  `;

  type CatRow = (typeof rows)[number] & { children: (typeof rows)[number][] };
  // Build tree
  const map = new Map(rows.map((r) => [r.categoryId, { ...r, children: [] as (typeof rows)[number][] } as CatRow]));
  const roots: CatRow[] = [];
  for (const r of rows) {
    if (r.parentId == null) {
      roots.push(map.get(r.categoryId)!);
    } else {
      const parent = map.get(r.parentId);
      if (parent) parent.children.push(map.get(r.categoryId)!);
    }
  }

  return NextResponse.json(roots);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, parentId, sensitivity, description, examples, sortOrder } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const [row] = await sql<{ categoryId: number }[]>`
    INSERT INTO bayanat.data_categories (name, parent_id, sensitivity, description, examples, sort_order)
    VALUES (
      ${name},
      ${parentId ?? null},
      ${sensitivity ?? "INTERNAL"},
      ${description ?? null},
      ${examples ?? null},
      ${sortOrder ?? 0}
    )
    RETURNING category_id AS "categoryId"
  `;

  return NextResponse.json({ categoryId: row.categoryId }, { status: 201 });
}
