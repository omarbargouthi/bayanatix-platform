-- 201: The Add rule and Failing records pop-ups on a table's Data Quality tab, and the
-- rule rows under it, were hard-coded English. They are now UI strings with Arabic,
-- including the rule template names, descriptions and setting labels (shared with the
-- rule form on the Data Quality page) and the reference table picker. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr201 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr201 (key_code, category_code, base_text, ar_text) VALUES
  ('catalog.dqFailingRecordsN', 'UI_CATALOG', 'Failing records ({n})', 'السجلات الفاشلة ({n})'),
  ('catalog.dqFailingHint', 'UI_CATALOG', 'values that did not meet the rule''s condition', 'القيم التي لم تستوفِ شرط القاعدة'),
  ('catalog.dqNoFailingCaptured', 'UI_CATALOG', 'No failing records were captured.', 'لم تُلتقط أي سجلات مخالفة.'),
  ('catalog.dqValidSamplesN', 'UI_CATALOG', 'Sample of valid values ({n})', 'عينة من القيم الصحيحة ({n})'),
  ('catalog.dqLevelTableHint', 'UI_CATALOG', 'The rule applies to the whole {name} table (row counts, freshness and similar).', 'تنطبق القاعدة على الجدول {name} كاملاً (عدد الصفوف والحداثة وما شابه).'),
  ('catalog.dqLevelColumnHint', 'UI_CATALOG', 'Select one or more columns; one rule is created for each.', 'اختر عموداً أو أكثر؛ تُنشأ قاعدة لكل عمود.'),
  ('catalog.dqColsSelected', 'UI_CATALOG', 'Selected: {n} (one rule each)', 'المختارة: {n} (قاعدة لكل عمود)'),
  ('catalog.dqSelectAll', 'UI_CATALOG', 'All', 'الكل'),
  ('catalog.dqSelectNone', 'UI_CATALOG', 'None', 'لا شيء'),
  ('catalog.dqRuleNamePh', 'UI_CATALOG', 'e.g. Row count check', 'مثال: فحص عدد الصفوف'),
  ('catalog.dqTplTableOnly', 'UI_CATALOG', 'Templates for table-level rules', 'قوالب القواعد على مستوى الجدول'),
  ('catalog.dqTplColumnOnly', 'UI_CATALOG', 'Templates for column-level rules', 'قوالب القواعد على مستوى العمود'),
  ('catalog.dqAllowedValuesHint', 'UI_CATALOG', 'Separate the allowed values with commas, for example: active, inactive, pending.', 'افصل القيم المسموح بها بفواصل، مثل: active, inactive, pending.'),
  ('catalog.dqErrNameRequired', 'UI_CATALOG', 'Enter a rule name.', 'أدخل اسم القاعدة.'),
  ('catalog.dqErrSelectColumn', 'UI_CATALOG', 'Select at least one column.', 'اختر عموداً واحداً على الأقل.'),
  ('catalog.dqErrCreate', 'UI_CATALOG', 'Not all the rules could be created. Check the list before you try again.', 'تعذر إنشاء بعض القواعد أو كلها. راجع القائمة قبل المحاولة مجدداً.'),
  ('catalog.dqDeleteConfirm', 'UI_CATALOG', 'Delete the rule "{name}"? Its run history is deleted too.', 'حذف القاعدة «{name}»؟ يُحذف سجل تشغيلها أيضاً.'),
  ('catalog.dqDeleteFailed', 'UI_CATALOG', 'The rule could not be deleted.', 'تعذر حذف القاعدة.'),
  ('catalog.dqViewFailingTitle', 'UI_CATALOG', 'See the records that failed this rule', 'عرض السجلات التي لم تستوفِ هذه القاعدة'),
  ('catalog.dqDeleteTitle', 'UI_CATALOG', 'Delete this rule', 'حذف هذه القاعدة'),
  ('catalog.dqExecError', 'UI_CATALOG', 'Execution error:', 'خطأ في التشغيل:'),
  ('catalog.dqExecErrorBadge', 'UI_CATALOG', 'Execution error', 'خطأ في التشغيل'),
  ('catalog.dqExecErrorsHint', 'UI_CATALOG', 'These rules could not run. Check their settings on the Data Quality page.', 'تعذر تشغيل هذه القواعد. راجع إعداداتها في صفحة جودة البيانات.'),
  ('catalog.dqColChip', 'UI_CATALOG', 'Column', 'عمود'),
  ('catalog.dqFailBelowShort', 'UI_CATALOG', 'Fail < {n}%', 'فشل < {n}%'),
  ('catalog.dqWarnBelowShort', 'UI_CATALOG', 'Warn < {n}%', 'تحذير < {n}%'),
  ('catalog.dqLastRun', 'UI_CATALOG', 'Last run: {date}', 'آخر تشغيل: {date}'),
  ('catalog.dqScanned', 'UI_CATALOG', 'Scanned: {n}', 'المفحوصة: {n}'),
  ('catalog.dqFailedRecordsN', 'UI_CATALOG', 'Failed records: {n}', 'السجلات الفاشلة: {n}'),
  ('catalog.dqRunUnreachable', 'UI_CATALOG', 'The rule could not be run. Check your connection and try again.', 'تعذر تشغيل القاعدة. تحقق من الاتصال وحاول مجدداً.'),
  ('dq.refSelectTable', 'UI_DQ', 'Select table…', 'اختر جدولاً…'),
  ('dq.refSearchTables', 'UI_DQ', 'Search tables…', 'ابحث في الجداول…'),
  ('dq.refNoTables', 'UI_DQ', 'No tables found', 'لا توجد جداول'),
  ('dq.refSelectColumn', 'UI_DQ', 'Select column…', 'اختر عموداً…'),
  ('dq.refFilterColumns', 'UI_DQ', 'Filter columns…', 'تصفية الأعمدة…'),
  ('dq.refNoColumns', 'UI_DQ', 'No columns found', 'لا توجد أعمدة'),
  ('dq.refSelectTableFirst', 'UI_DQ', 'Select a table first', 'اختر جدولاً أولاً'),
  ('dq.templates.NOT_NULL', 'UI_DQ', 'Not Null', 'خلو من القيم الفارغة'),
  ('dq.templates.COMPLETENESS_RATE', 'UI_DQ', 'Completeness Rate', 'نسبة الاكتمال'),
  ('dq.templates.REGEX_MATCH', 'UI_DQ', 'Regex Pattern Match', 'مطابقة تعبير نمطي'),
  ('dq.templates.VALUE_IN_LIST', 'UI_DQ', 'Value in List', 'قيمة ضمن قائمة'),
  ('dq.templates.RANGE_CHECK', 'UI_DQ', 'Numeric Range Check', 'فحص النطاق الرقمي'),
  ('dq.templates.UNIQUE', 'UI_DQ', 'Uniqueness Check', 'فحص التفرد'),
  ('dq.templates.ROW_COUNT_THRESHOLD', 'UI_DQ', 'Row Count Threshold', 'حد عدد الصفوف'),
  ('dq.templates.FRESHNESS_CHECK', 'UI_DQ', 'Freshness', 'حداثة البيانات'),
  ('dq.templates.REFERENTIAL_CHECK', 'UI_DQ', 'Referential Integrity', 'التكامل المرجعي'),
  ('dq.templates.CUSTOM_SQL', 'UI_DQ', 'Custom SQL', 'استعلام SQL مخصص'),
  ('dq.templateDescriptions.NOT_NULL', 'UI_DQ', 'Checks that a column has no null values.', 'يتحقق من خلو العمود من القيم الفارغة.'),
  ('dq.templateDescriptions.COMPLETENESS_RATE', 'UI_DQ', 'Fails if null percentage exceeds the configured threshold.', 'تفشل إذا تجاوزت نسبة القيم الفارغة الحد المحدد.'),
  ('dq.templateDescriptions.REGEX_MATCH', 'UI_DQ', 'Validates column values against a regular expression.', 'يتحقق من قيم العمود مقابل تعبير نمطي.'),
  ('dq.templateDescriptions.VALUE_IN_LIST', 'UI_DQ', 'Checks column values are within an allowed set.', 'يتحقق من أن قيم العمود ضمن قائمة مسموح بها.'),
  ('dq.templateDescriptions.RANGE_CHECK', 'UI_DQ', 'Validates numeric column values fall within min/max bounds.', 'يتحقق من أن القيم الرقمية بين حد أدنى وحد أعلى.'),
  ('dq.templateDescriptions.UNIQUE', 'UI_DQ', 'Checks for duplicate values in a column.', 'يتحقق من عدم تكرار القيم في العمود.'),
  ('dq.templateDescriptions.ROW_COUNT_THRESHOLD', 'UI_DQ', 'Fails if table row count drops below minimum.', 'تفشل إذا قل عدد صفوف الجدول عن الحد الأدنى.'),
  ('dq.templateDescriptions.FRESHNESS_CHECK', 'UI_DQ', 'Checks that a date column has recent values within configured hours.', 'يتحقق من أن عمود التاريخ يحوي قيماً حديثة ضمن عدد الساعات المحدد.'),
  ('dq.templateDescriptions.REFERENTIAL_CHECK', 'UI_DQ', 'Verifies FK values exist in the referenced table.', 'يتحقق من وجود قيم المفتاح الخارجي في الجدول المرجعي.'),
  ('dq.templateDescriptions.CUSTOM_SQL', 'UI_DQ', 'Run a custom SQL expression. Must return total_rows and failed_rows.', 'يشغّل استعلام SQL خاصاً بك، ويجب أن يُرجع total_rows و failed_rows.'),
  ('dq.templateFields.max_null_pct', 'UI_DQ', 'Max Null %', 'أقصى نسبة للقيم الفارغة %'),
  ('dq.templateFields.pattern', 'UI_DQ', 'Regex Pattern', 'التعبير النمطي'),
  ('dq.templateFields.allowed_values', 'UI_DQ', 'Allowed Values (comma-separated)', 'القيم المسموح بها (مفصولة بفواصل)'),
  ('dq.templateFields.min_value', 'UI_DQ', 'Min Value', 'الحد الأدنى'),
  ('dq.templateFields.max_value', 'UI_DQ', 'Max Value', 'الحد الأعلى'),
  ('dq.templateFields.min_rows', 'UI_DQ', 'Minimum Row Count', 'أقل عدد للصفوف'),
  ('dq.templateFields.max_age_hours', 'UI_DQ', 'Max Age (hours)', 'أقصى عمر (بالساعات)'),
  ('dq.templateFields.ref_table', 'UI_DQ', 'Reference Table', 'الجدول المرجعي'),
  ('dq.templateFields.ref_column', 'UI_DQ', 'Reference Column', 'العمود المرجعي');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr201
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr201 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
