-- 195: The Stitching review button moved from the lineage graph to the Mapping asset view,
-- where it is now a translated text. Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
VALUES ('UI_LINEAGEREGISTER', 'lineageRegister.stitchingReview', 'Stitching review')
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', 'مراجعة الربط بين الأنظمة', 'VERIFIED', now(), now()
FROM bayanat.translation_keys tk
WHERE tk.key_code = 'lineageRegister.stitchingReview'
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
