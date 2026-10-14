-- 194: Questionnaire editor texts after the editor became English-only (translations are made
-- in Languages & Translations) and the choice of questionnaires moved to Configuration.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr194 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr194 (key_code, category_code, base_text, ar_text) VALUES
  ('dpiaTemplates.translationsNote', 'UI_DPIA', 'Texts are written here in English. Arabic and any other enabled language are translated in Languages & Translations, where a changed English text shows as needing a new translation.', 'تُكتب النصوص هنا بالإنجليزية. وتُترجم إلى العربية وأي لغة مفعّلة أخرى في «اللغات والترجمات»، حيث يظهر النص الإنجليزي المعدَّل بحاجة إلى ترجمة جديدة.'),
  ('dpiaTemplates.translationsLink', 'UI_DPIA', 'Translate the questionnaire texts', 'ترجمة نصوص الاستبيانات'),
  ('dpiaTemplates.useNote', 'UI_DPIA', 'Which questionnaires are used, and the default, are chosen by an administrator in Configuration › Privacy & Retention.', 'يختار مدير النظام الاستبيانات المستخدمة والاستبيان الافتراضي من «الإعدادات › الخصوصية والاحتفاظ».'),
  ('dpiaTemplates.useLink', 'UI_DPIA', 'Open Configuration', 'فتح الإعدادات'),
  ('dpiaTemplates.statusInUse', 'UI_DPIA', 'In use', 'مستخدم'),
  ('dpiaTemplates.badgeInactive', 'UI_DPIA', 'Not in use', 'غير مستخدم'),
  ('dpiaTemplates.newHint', 'UI_DPIA', 'The new questionnaire is not used until an administrator selects it in Configuration.', 'لا يُستخدم الاستبيان الجديد حتى يختاره مدير النظام من الإعدادات.'),
  ('dpiaTemplates.errors.TEMPLATE_ACTIVE', 'UI_DPIA', 'This questionnaire is in use. Take it out of use in Configuration first.', 'هذا الاستبيان مستخدم. أوقف استخدامه من الإعدادات أولاً.'),
  ('dpiaTemplates.errors.TEMPLATE_IN_USE', 'UI_DPIA', 'Assessments use this questionnaire, so it stays; it can be taken out of use in Configuration.', 'تستخدم تقييماتٌ هذا الاستبيان، لذا يبقى؛ ويمكن إيقاف استخدامه من الإعدادات.'),
  ('dpiaTemplates.errors.NONE_IN_USE', 'UI_DPIA', 'Choose at least one questionnaire.', 'اختر استبياناً واحداً على الأقل.'),
  ('dpiaTemplates.errors.DEFAULT_NOT_IN_USE', 'UI_DPIA', 'The default must be one of the questionnaires in use.', 'يجب أن يكون الاستبيان الافتراضي أحد الاستبيانات المستخدمة.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr194
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr194 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

-- Labels of the Arabic boxes and of the "offered" and "default" switches, no longer shown.
DELETE FROM bayanat.translation_keys WHERE key_code IN ('dpiaTemplates.inEnglish', 'dpiaTemplates.inArabic', 'dpiaTemplates.arStale', 'dpiaTemplates.arMissing', 'dpiaTemplates.fActive', 'dpiaTemplates.fDefault', 'dpiaTemplates.errors.DEFAULT_REQUIRED');

COMMIT;
