-- 193: Data Privacy gets its own sub-menu (Data Retention, Data Subject Requests, Impact
-- Assessments), and the Data Retention page no longer covers data subject requests. See db/174.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr193 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr193 (key_code, category_code, base_text, ar_text) VALUES
  ('nav.privacyRetention', 'UI_NAV', 'Data Retention', 'الاحتفاظ بالبيانات'),
  ('nav.privacyRequests', 'UI_NAV', 'Data Subject Requests', 'طلبات أصحاب البيانات'),
  ('nav.privacyDpia', 'UI_NAV', 'Impact Assessments', 'تقييمات الأثر'),
  ('retention.pageDesc', 'UI_RETENTION', 'Manage data retention categories, schedules and legal holds', 'إدارة فئات الاحتفاظ بالبيانات والجداول الزمنية والتجميد القانوني');

-- An existing key keeps its category; only its text changes.
INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr193
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr193 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
