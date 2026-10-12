-- 175: Arabic for the two catalog gauge titles reworded to "… (CDEs)".
-- "Metadata Quality (CDEs)" and "Data Quality (CDEs)" were reworded in English, which
-- left their Arabic marked STALE — so the Arabic catalog page showed them in English.
-- lib/i18n/ar.ts already holds the reworded Arabic; this loads it (see db/174 for why
-- the file alone is not enough).
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM (VALUES
  ('catalog.metadataQuality', 'جودة البيانات الوصفية (عناصر البيانات الحرجة)'),
  ('catalog.dataQuality',     'جودة البيانات (عناصر البيانات الحرجة)')
) AS n(key_code, ar_text)
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
