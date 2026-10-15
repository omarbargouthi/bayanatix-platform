-- 210: Arabic for Report a data breach in New Request (db/207). See db/174.
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('UI_BREACH', 'Data Breaches', 'UI')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr210 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr210 (key_code, category_code, base_text, ar_text) VALUES
  ('breach.newRequestLabel', 'UI_BREACH', 'Report a data breach', 'الإبلاغ عن خرق للبيانات'),
  ('breach.newRequestDesc', 'UI_BREACH', 'Personal data exposed, lost, changed or sent to the wrong person', 'بيانات شخصية كُشفت أو فُقدت أو عُدّلت أو أُرسلت إلى شخص خاطئ'),
  ('breach.newRequestNote', 'UI_BREACH', 'The data protection team is notified at once. Report even if you are not sure: they will check.', 'يُشعَر فريق حماية البيانات فوراً. أبلغ حتى لو لم تكن متأكداً، وسيتحققون من الأمر.'),
  ('breach.submitted', 'UI_BREACH', 'Breach {ref} reported. The data protection team has been notified and will follow up.', 'تم الإبلاغ عن الخرق {ref}. وأُشعر فريق حماية البيانات وسيتابع الأمر.'),
  ('breach.openIt', 'UI_BREACH', 'Open the breach', 'فتح الخرق'),
  ('breach.done', 'UI_BREACH', 'Done', 'تم');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr210
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr210 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
