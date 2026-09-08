// Generic runtime resolver for the "standard" translation architecture: English
// stays the source-of-record column on the domain's own table (unchanged), and
// every other language is resolved live from bayanat.translation_keys/translations
// — same tables the Language Management Workbench already edits, same key_code
// convention lib/i18n-admin/translatable-fields.ts's syncListValueKeys() already
// populates. This is the read-side counterpart: app/api/lookups/all/route.ts
// proved the pattern for app_lookups; this generalizes it to any domain whose
// key_code follows `{keyPrefix}.{id}[.{keySuffix}]`, so a domain's query function
// can embed one extra JSON-map column per translatable field instead of a
// hardcoded `_ar` column, with zero schema change needed for a future language.

/**
 * Returns a SQL fragment (for splicing into a template's raw column list) that
 * selects a `{language_code: translated_text}` JSON map for one translatable
 * field, as an extra column. `keyCodeSql` is a raw SQL expression producing the
 * key_code for the current row — usually a concatenation against the row's own
 * id column, e.g. `'compliance.req.' || r.req_id || '.question'`.
 *
 * Only non-STALE, non-null translations are included — a STALE row (the base
 * text changed since it was translated) should fall back to the English base
 * at render time via pickTranslation(), not surface outdated text silently.
 */
export function translatedColumnSql(keyCodeSql: string, alias: string): string {
  return `(
    SELECT jsonb_object_agg(t.language_code, t.translated_text)
    FROM bayanat.translation_keys tk
    JOIN bayanat.translations t
      ON t.key_id = tk.key_id AND t.status_code <> 'STALE' AND t.translated_text IS NOT NULL
    WHERE tk.key_code = ${keyCodeSql}
  ) AS "${alias}"`;
}

/** Client- and server-safe: picks the right-language text out of a resolved
 *  translations map, falling back to the English base when the current
 *  language has no (or a stale) translation yet. */
export function pickTranslation(
  base: string | null | undefined,
  translations: Record<string, string> | null | undefined,
  lang: string,
): string {
  if (lang === "en") return base ?? "";
  return translations?.[lang] ?? base ?? "";
}
