-- 180: the Dashboard's source statistics start on the signed-in user's own sources for
-- everyone, the Data Management Office side included; the texts that say so, in Arabic
-- too (see db/174), and the one they replace removed.
-- Safe to run more than once.

BEGIN;

DELETE FROM bayanat.translation_keys WHERE key_code = 'sourceStats.dashboardSubtitleAll';

CREATE TEMP TABLE _tr180 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr180 (key_code, category_code, base_text, ar_text) VALUES
  ('sourceStats.dashboardSubtitleOffice', 'UI_SOURCESTATS', 'The source systems you hold a governance role on. Use the filters to see all source systems, one source, or a steward''s sources.', 'الأنظمة المصدرية التي لديك دور حوكمة عليها. استخدم عوامل التصفية لعرض جميع الأنظمة المصدرية أو مصدر واحد أو مصادر أحد المشرفين.'),
  ('sourceStats.allStewardSources', 'UI_SOURCESTATS', 'All of this steward''s sources', 'جميع مصادر هذا المشرف'),
  ('sourceStats.noOwnSourcesOffice', 'UI_SOURCESTATS', 'You hold no governance role on a source system. Choose “All source systems” in the filter to see every source.', 'ليس لديك دور حوكمة على أي نظام مصدري. اختر «جميع الأنظمة المصدرية» من عامل التصفية لعرض كل المصادر.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr180
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr180 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
