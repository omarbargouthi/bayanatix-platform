-- 200: Data Quality tab on the table page: chart titles, legends and labels were
-- hard-coded English; they are now UI strings with Arabic. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr200 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr200 (key_code, category_code, base_text, ar_text) VALUES
  ('catalog.dqRulesHeading', 'UI_CATALOG', 'DQ Rules — {name}', 'قواعد الجودة — {name}'),
  ('catalog.dqRuleSummary', 'UI_CATALOG', 'Rules: {n} · Dimensions: {d}', 'القواعد: {n} · الأبعاد: {d}'),
  ('catalog.dqErrorCount', 'UI_CATALOG', 'Execution errors: {n}', 'أخطاء التشغيل: {n}'),
  ('catalog.dqRuleCountShort', 'UI_CATALOG', 'Rules: {n}', 'القواعد: {n}'),
  ('catalog.dqChartRulesPerDim', 'UI_CATALOG', 'Rules per dimension', 'القواعد حسب البُعد'),
  ('catalog.dqChartRulesPerDimSub', 'UI_CATALOG', 'Number of data quality rules in each dimension', 'عدد قواعد جودة البيانات في كل بُعد'),
  ('catalog.dqChartBySeverity', 'UI_CATALOG', 'Rules by severity', 'القواعد حسب الخطورة'),
  ('catalog.dqChartBySeveritySub', 'UI_CATALOG', 'How the rules are spread across severity levels', 'توزيع القواعد على مستويات الخطورة'),
  ('catalog.dqChartScore', 'UI_CATALOG', 'Score per dimension', 'الدرجة حسب البُعد'),
  ('catalog.dqChartScoreSub', 'UI_CATALOG', 'Average latest score of the active rules in each dimension', 'متوسط آخر درجة للقواعد النشطة في كل بُعد'),
  ('catalog.dqChartResults', 'UI_CATALOG', 'Latest results per dimension', 'آخر النتائج حسب البُعد'),
  ('catalog.dqChartResultsSub', 'UI_CATALOG', 'Each rule''s latest result against its thresholds', 'آخر نتيجة لكل قاعدة مقارنةً بحدودها'),
  ('catalog.dqNoRulesYet', 'UI_CATALOG', 'No rules defined yet', 'لا توجد قواعد بعد'),
  ('catalog.dqRunToSeeScores', 'UI_CATALOG', 'Run rules to see dimension scores', 'شغّل القواعد لعرض درجات الأبعاد'),
  ('catalog.dqAvgLabel', 'UI_CATALOG', 'average', 'المتوسط'),
  ('catalog.dqAvgPct', 'UI_CATALOG', '{pct}% average', 'المتوسط {pct}%'),
  ('catalog.dqOtherDim', 'UI_CATALOG', 'Other', 'أخرى'),
  ('catalog.dqPassShort', 'UI_CATALOG', 'Pass', 'ناجح'),
  ('catalog.dqWarnShort', 'UI_CATALOG', 'Warn', 'تحذير'),
  ('catalog.dqFailShort', 'UI_CATALOG', 'Fail', 'فاشل');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr200
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr200 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
