-- 197: "How is this calculated?" notes on the table page, and one name per data quality
-- dimension: the CDE score card used its own labels ("Timeliness" for Freshness, with no
-- Arabic); it now shows the names from Configuration › DQ Dimensions. Safe to run more than once.

BEGIN;

-- Keep the card's stored labels equal to the dimension names (the app reads the names).
UPDATE bayanat.dq_cde_dimension_config c
SET display_label_text = d.dimension_name_text
FROM bayanat.dq_dimensions d
WHERE d.dimension_code = c.dimension_code AND c.display_label_text IS DISTINCT FROM d.dimension_name_text;

DELETE FROM bayanat.translation_keys WHERE key_code = 'catalog.timeliness';

CREATE TEMP TABLE _tr197 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr197 (key_code, category_code, base_text, ar_text) VALUES
  ('catalog.tableHealthHow', 'UI_CATALOG', E'The average of this table''s data quality dimension scores (the tiles under Data Quality).\n\nEach dimension scores the average latest result of the active rules on the table and its columns. Dimensions without a scored rule are left out.', E'متوسط درجات أبعاد جودة البيانات لهذا الجدول (المربعات تحت «جودة البيانات»).\n\nدرجة كل بُعد هي متوسط آخر نتيجة للقواعد النشطة على الجدول وأعمدته. تُستبعد الأبعاد التي لا توجد لها قاعدة ذات نتيجة.'),
  ('catalog.cdeCountHow', 'UI_CATALOG', E'Columns of this table whose classification term is Confidential, Secret or Top Secret.', E'أعمدة هذا الجدول التي مصطلح تصنيفها «سري» أو «سري للغاية» أو «سري جداً».'),
  ('catalog.metadataCompletionHow', 'UI_CATALOG', E'Columns with a description ÷ all columns of the table × 100.', E'الأعمدة التي لها وصف ÷ جميع أعمدة الجدول × 100.'),
  ('catalog.columnTypeHow', 'UI_CATALOG', E'Columns marked as business or technical ÷ all columns × 100.\n\nCounts columns confirmed by a steward or accepted automatically; suggestions still waiting for review are not counted.', E'الأعمدة المحدد نوعها (تجاري أو تقني) ÷ جميع الأعمدة × 100.\n\nتُحتسب الأعمدة التي أكدها أمين البيانات أو قُبلت تلقائياً، ولا تُحتسب الاقتراحات التي ما زالت بانتظار المراجعة.'),
  ('catalog.dqDimensionsHow', 'UI_CATALOG', E'One tile per dimension. Its score is the average latest result of the active rules on this table and its columns in that dimension; a rule''s result is 100 minus the percentage of failing records.\n\n"Not run yet" means the dimension has rules that have not run; "No rules" means it has none.', E'مربع لكل بُعد. درجته متوسط آخر نتيجة للقواعد النشطة على هذا الجدول وأعمدته في ذلك البُعد، ونتيجة القاعدة هي 100 ناقص نسبة السجلات المخالفة.\n\n«لم تُشغَّل بعد» تعني أن للبُعد قواعد لم تُشغَّل، و«لا قواعد» تعني أنه لا قواعد له.'),
  ('catalog.dqScoreHow', 'UI_CATALOG', E'The average latest score of all this table''s rules, on the table and its columns, that ran without an error, whether or not they are switched on.\n\nThe arrow compares with the rules'' previous run. Green from 90%, amber from 70%, red below.', E'متوسط آخر درجة لجميع قواعد هذا الجدول، على الجدول وأعمدته، التي اكتمل تشغيلها دون خطأ، سواء كانت مفعّلة أم لا.\n\nيقارن السهم بالتشغيل السابق للقواعد. أخضر من 90٪، وكهرماني من 70٪، وأحمر دون ذلك.'),
  ('catalog.dqRuleCountsHow', 'UI_CATALOG', E'Passing, Warnings and Failing count the rules by their latest result, judged against each rule''s thresholds: below the failure threshold fails, below the warning threshold warns. A rule without thresholds fails on any failing record.\n\nRules whose last run ended in an error are counted separately.', E'تَعُدّ «ناجحة» و«تحذيرات» و«فاشلة» القواعد حسب آخر نتيجة لها مقارنةً بحدود كل قاعدة: دون حد الفشل تفشل، ودون حد التحذير تُنذر. والقاعدة التي بلا حدود تفشل عند وجود أي سجل مخالف.\n\nتُحتسب القواعد التي انتهى آخر تشغيل لها بخطأ على حدة.'),
  ('catalog.profileHow', 'UI_CATALOG', E'Taken during the crawl from the rows set in the source''s profiling options (PostgreSQL and file sources).\n\nNull %: empty values among the rows read. Unique %: distinct values ÷ rows read × 100. Distinct, Min, Max and Top values come from the same rows; for personal-data columns they are not kept.', E'يُؤخذ أثناء الزحف من الصفوف المحددة في إعدادات التنميط للمصدر (PostgreSQL ومصادر الملفات).\n\nنسبة القيم الفارغة: القيم الفارغة بين الصفوف المقروءة. نسبة التفرد: القيم المميزة ÷ الصفوف المقروءة × 100. القيم المميزة والدنيا والعليا والأكثر تكراراً من الصفوف نفسها، ولا تُحفظ لأعمدة البيانات الشخصية.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr197
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr197 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
