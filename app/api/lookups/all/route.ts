import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// Returns all active lookups as a two-level map for O(1) client-side access.
// { GROUP: { CODE: { en, [langCode]... } } }. English always comes straight from
// app_lookups.lookup_label; every other enabled language is resolved through the
// Language Management translation_keys/translations tables (key_code =
// "list.app_lookups.{group}.{code}", kept in sync by
// lib/i18n-admin/translatable-fields.ts's syncListValueKeys) rather than the old
// hardcoded label_ar column, so this generalizes past a single "secondary language."
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseRows = await sql<{ group: string; code: string; en: string }[]>`
    SELECT lookup_group AS "group", lookup_code AS code, lookup_label AS en
    FROM  bayanat.app_lookups
    WHERE is_active = true
    ORDER BY lookup_group, sort_order, lookup_label
  `;

  const cache: Record<string, Record<string, Record<string, string | null>>> = {};
  for (const { group, code, en } of baseRows) {
    if (!cache[group]) cache[group] = {};
    cache[group][code] = { en };
  }

  const langRows = await sql<{ group: string; code: string; langCode: string; value: string | null }[]>`
    SELECT al.lookup_group AS "group", al.lookup_code AS code, l.language_code AS "langCode", t.translated_text AS value
    FROM bayanat.app_lookups al
    CROSS JOIN bayanat.languages l
    LEFT JOIN bayanat.translation_keys tk ON tk.key_code = 'list.app_lookups.' || al.lookup_group || '.' || al.lookup_code
    LEFT JOIN bayanat.translations t ON t.key_id = tk.key_id AND t.language_code = l.language_code AND t.status_code <> 'STALE'
    WHERE al.is_active = true AND l.language_code <> 'en' AND l.is_enabled_indicator = true
  `;
  for (const { group, code, langCode, value } of langRows) {
    if (cache[group]?.[code]) cache[group][code][langCode] = value;
  }

  return NextResponse.json(cache, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
