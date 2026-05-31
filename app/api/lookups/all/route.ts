import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Returns all active lookups as a two-level map for O(1) client-side access.
// { GROUP: { CODE: { en, ar, [langCode]... } } }
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{ group: string; code: string; en: string; ar: string | null }[]>`
    SELECT
      lookup_group  AS "group",
      lookup_code   AS code,
      lookup_label  AS en,
      label_ar      AS ar
    FROM  bayanat.app_lookups
    WHERE is_active = true
    ORDER BY lookup_group, sort_order, lookup_label
  `;

  const cache: Record<string, Record<string, Record<string, string | null>>> = {};
  for (const { group, code, en, ar } of rows) {
    if (!cache[group]) cache[group] = {};
    cache[group][code] = { en, ar };
  }

  return NextResponse.json(cache, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
