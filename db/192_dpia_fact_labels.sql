-- 192: Arabic for two catalog-fact labels on impact assessments: personal data without a
-- category, and columns classified sensitive without one. See db/187.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr192 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr192 (key_code, category_code, base_text, ar_text) VALUES
  ('dpia.facts.uncategorised', 'UI_DPIA', 'No category', 'بلا فئة'),
  ('dpia.facts.sensitiveClass', 'UI_DPIA', 'Classified sensitive', 'مصنّفة حساسة');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr192
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr192 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
