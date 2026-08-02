import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";

const VALID_GROUPS = ["SURROGATE_KEY", "AUDIT_COLUMN", "NATURAL_ID", "LOOKUP_VALUE", "EXCLUDE"];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dataSourceId = searchParams.get("dataSourceId");

  const rows = await sql<{
    patternId: number; group: string; regex: string; dataSourceId: number | null;
    sourceName: string | null; enabled: boolean; notes: string | null;
  }[]>`
    SELECT
      cp.pattern_id AS "patternId", cp.pattern_group_code AS group, cp.pattern_regex_text AS regex,
      cp.data_source_id AS "dataSourceId", ds.source_name_text AS "sourceName",
      cp.is_enabled_indicator AS enabled, cp.notes_text AS notes
    FROM bayanat.classification_patterns cp
    LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = cp.data_source_id
    WHERE (${dataSourceId ?? null}::int IS NULL OR cp.data_source_id IS NULL OR cp.data_source_id = ${dataSourceId ?? null}::int)
    ORDER BY cp.pattern_group_code, cp.data_source_id NULLS FIRST, cp.pattern_id
  `;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { pattern_group_code: group, pattern_regex_text: regex, data_source_id: dataSourceId, notes_text: notes } = body;

  if (!VALID_GROUPS.includes(group)) return NextResponse.json({ error: `pattern_group_code must be one of ${VALID_GROUPS.join(", ")}` }, { status: 400 });
  if (!regex?.trim()) return NextResponse.json({ error: "pattern_regex_text is required" }, { status: 400 });
  try { new RegExp(regex); } catch { return NextResponse.json({ error: "pattern_regex_text is not a valid regular expression" }, { status: 400 }); }

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.classification_patterns (pattern_group_code, pattern_regex_text, data_source_id, notes_text)
    VALUES (${group}, ${regex.trim()}, ${dataSourceId ?? null}, ${notes ?? null})
    RETURNING pattern_id AS id
  `;
  return NextResponse.json({ patternId: row.id }, { status: 201 });
}
