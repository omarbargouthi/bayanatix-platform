-- 224: The environment badge's labels are translated (common.environment.*), and the
-- hosted demo (built with NEXT_PUBLIC_APP_ENVIRONMENT=DEMO) shows a "Demo" badge.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr224 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr224 (key_code, category_code, base_text, ar_text) VALUES
  ('common.environment.DEV', 'UI_COMMON', 'Development', 'تطوير'),
  ('common.environment.TEST', 'UI_COMMON', 'Test', 'اختبار'),
  ('common.environment.PROD', 'UI_COMMON', 'Production', 'إنتاج'),
  ('common.environment.DEMO', 'UI_COMMON', 'Demo', 'عرض تجريبي');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr224
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr224 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
