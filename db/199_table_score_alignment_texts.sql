-- 199: The table page's Data Quality tab score now uses the Schema tab's calculation
-- (average of dimension scores, active rules only), and its CDE count matches the Data
-- Catalog page (active business columns only). Rewords the three "?" notes that describe
-- them. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr199 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr199 (key_code, category_code, base_text, ar_text) VALUES
  ('catalog.tableHealthHow', 'UI_CATALOG', E'The average of this table''s data quality dimension scores (the tiles under Data Quality).\n\nEach dimension scores the average latest result of the active rules on the table and its columns. Dimensions without a scored rule, and runs that ended in an error, are left out.', E'متوسط درجات أبعاد جودة البيانات لهذا الجدول (المربعات تحت «جودة البيانات»).\n\nدرجة كل بُعد هي متوسط آخر نتيجة للقواعد النشطة على الجدول وأعمدته. تُستبعد الأبعاد التي لا توجد لها قاعدة ذات نتيجة، والتشغيلات التي انتهت بخطأ.'),
  ('catalog.cdeCountHow', 'UI_CATALOG', E'Business columns of this table whose classification term is Confidential, Secret or Top Secret. Technical and deprecated columns are not counted, as on the Data Catalog page.', E'الأعمدة التجارية في هذا الجدول التي مصطلح تصنيفها «سري» أو «سري للغاية» أو «سري جداً». لا تُحتسب الأعمدة التقنية والملغاة، كما في صفحة فهرس البيانات.'),
  ('catalog.dqScoreHow', 'UI_CATALOG', E'The same score as the overall quality score on the Schema tab: the average of the table''s dimension scores. Each dimension scores the average latest result of its active rules, on the table and its columns. Runs that ended in an error are left out.\n\nThe arrow compares with the rules'' previous run. Green from 90%, amber from 70%, red below.', E'الدرجة نفسها التي تظهر كدرجة الجودة الإجمالية في تبويب «المخطط»: متوسط درجات أبعاد الجدول. درجة كل بُعد هي متوسط آخر نتيجة لقواعده النشطة، على الجدول وأعمدته. تُستبعد التشغيلات التي انتهت بخطأ.\n\nيقارن السهم بالتشغيل السابق للقواعد. أخضر من 90٪، وكهرماني من 70٪، وأحمر دون ذلك.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr199
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr199 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
